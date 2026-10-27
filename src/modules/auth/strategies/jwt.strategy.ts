import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret', 'super-secret-dairy-jwt-access-key'),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { userId: payload.sub },
      include: {
        merchant: true,
        deliveryPartner: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive, deactivated, or not found');
    }

    return {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      merchantId: user.merchant?.merchantId,
      deliveryPartnerId: user.deliveryPartner?.deliveryPartnerId,
    };
  }
}
