import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { IdGeneratorService, IdPrefix } from '../../common/services/id-generator.service';
import { RedisService } from '../../redis/redis.service';
import {
  LoginDto,
  RegisterCustomerDto,
  RegisterMerchantDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  VerifyResetOtpDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly memoryOtpStore = new Map<string, { otp: string; expiresAt: number }>();
  private readonly memoryTokenStore = new Map<string, { token: string; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly idGenerator: IdGeneratorService,
    private readonly redisService: RedisService,
  ) {}

  async registerCustomer(dto: RegisterCustomerDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const saltRounds = Number(this.configService.get('PASSWORD_SALT_ROUNDS')) || 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const userId = await this.idGenerator.generateId(IdPrefix.USER);

    const user = await this.prisma.user.create({
      data: {
        userId,
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        role: UserRole.CUSTOMER,
        customer: {
          create: {},
        },
      },
      include: {
        customer: true,
      },
    });

    const tokens = await this.generateTokens({
      userId: user.userId,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ...tokens,
    };
  }

  async registerMerchant(dto: RegisterMerchantDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const saltRounds = Number(this.configService.get('PASSWORD_SALT_ROUNDS')) || 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const userId = await this.idGenerator.generateId(IdPrefix.USER);
    const merchantId = await this.idGenerator.generateId(IdPrefix.MERCHANT);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          userId,
          email: dto.email.toLowerCase(),
          passwordHash,
          name: dto.ownerName,
          phone: dto.phone,
          role: UserRole.MERCHANT,
        },
      });

      const merchant = await tx.merchant.create({
        data: {
          merchantId,
          userId: createdUser.userId,
          businessName: dto.businessName,
          address: dto.address,
          phone: dto.phone,
          email: dto.email.toLowerCase(),
        },
      });

      return { ...createdUser, merchant };
    });

    const tokens = await this.generateTokens({
      userId: user.userId,
      email: user.email,
      role: user.role,
      merchantId: user.merchant.merchantId,
    });

    return {
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        merchantId: user.merchant.merchantId,
        businessName: user.merchant.businessName,
      },
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        merchant: true,
        deliveryPartner: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account has been deactivated. Please contact support.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    const tokens = await this.generateTokens({
      userId: user.userId,
      email: user.email,
      role: user.role,
      merchantId: user.merchant?.merchantId,
      deliveryPartnerId: user.deliveryPartner?.deliveryPartnerId,
    });

    return {
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        merchantId: user.merchant?.merchantId,
        deliveryPartnerId: user.deliveryPartner?.deliveryPartnerId,
      },
      ...tokens,
    };
  }

  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const user = await this.prisma.user.findUnique({
        where: { userId: payload.sub },
        include: {
          merchant: true,
          deliveryPartner: true,
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User account no longer active');
      }

      return await this.generateTokens({
        userId: user.userId,
        email: user.email,
        role: user.role,
        merchantId: user.merchant?.merchantId,
        deliveryPartnerId: user.deliveryPartner?.deliveryPartnerId,
      });
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException('No account found with this email address.');
    }

    if (!user.isActive) {
      throw new BadRequestException('Account is deactivated. Please contact support.');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const emailKey = dto.email.toLowerCase();
    const redisKey = `otp:reset:${emailKey}`;

    // Store in Redis (10 minutes) & Memory Fallback (10 minutes)
    await this.redisService.set(redisKey, otp, 600);
    this.memoryOtpStore.set(emailKey, {
      otp,
      expiresAt: Date.now() + 600 * 1000,
    });

    console.log(`\n======================================================`);
    console.log(`[AUTH OTP] Password Reset OTP for ${dto.email}: ${otp}`);
    console.log(`======================================================\n`);

    return {
      success: true,
      message: `OTP sent to ${dto.email}. Please verify to continue.`,
      devOtp: otp,
    };
  }

  async verifyResetOtp(dto: VerifyResetOtpDto) {
    const emailKey = dto.email.toLowerCase();
    const redisKey = `otp:reset:${emailKey}`;

    let storedOtp = await this.redisService.get(redisKey);
    if (!storedOtp) {
      const mem = this.memoryOtpStore.get(emailKey);
      if (mem && mem.expiresAt > Date.now()) {
        storedOtp = mem.otp;
      }
    }

    if (!storedOtp) {
      throw new BadRequestException('OTP has expired or was not requested. Please request a new OTP.');
    }

    if (storedOtp !== dto.otp.trim()) {
      throw new BadRequestException('Invalid OTP. Please check and try again.');
    }

    // Generate temporary reset token valid for 15 minutes
    const resetToken = `rst_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
    const tokenKey = `token:reset:${emailKey}`;

    await this.redisService.set(tokenKey, resetToken, 900);
    this.memoryTokenStore.set(emailKey, {
      token: resetToken,
      expiresAt: Date.now() + 900 * 1000,
    });

    // Invalidate consumed OTP
    await this.redisService.del(redisKey);
    this.memoryOtpStore.delete(emailKey);

    return {
      success: true,
      message: 'OTP verified successfully.',
      resetToken,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const emailKey = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: emailKey },
    });

    if (!user) {
      throw new NotFoundException('No account found with this email address.');
    }

    if (!user.isActive) {
      throw new BadRequestException('Account is deactivated. Please contact support.');
    }

    // Verify resetToken
    const tokenKey = `token:reset:${emailKey}`;
    let validToken = await this.redisService.get(tokenKey);
    if (!validToken) {
      const mem = this.memoryTokenStore.get(emailKey);
      if (mem && mem.expiresAt > Date.now()) {
        validToken = mem.token;
      }
    }

    if (!validToken || validToken !== dto.resetToken) {
      throw new BadRequestException('Invalid or expired reset session. Please verify OTP again.');
    }

    const saltRounds = Number(this.configService.get('PASSWORD_SALT_ROUNDS')) || 10;
    const passwordHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.user.update({
      where: { userId: user.userId },
      data: { passwordHash },
    });

    // Clean up used token
    await this.redisService.del(tokenKey);
    this.memoryTokenStore.delete(emailKey);

    return {
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    };
  }

  private async generateTokens(payload: {
    userId: string;
    email: string;
    role: UserRole;
    merchantId?: string;
    deliveryPartnerId?: string;
  }) {
    const jwtPayload = {
      sub: payload.userId,
      email: payload.email,
      role: payload.role,
      merchantId: payload.merchantId,
      deliveryPartnerId: payload.deliveryPartnerId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('jwt.secret'),
        expiresIn: this.configService.get<string>('jwt.expiresIn', '1d'),
      }),
      this.jwtService.signAsync(jwtPayload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn', '7d'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get<string>('jwt.expiresIn', '1d'),
    };
  }
}
