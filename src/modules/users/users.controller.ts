import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateUserDto, ChangePasswordDto } from './dto/user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getMyProfile(@CurrentUser('userId') userId: string) {
    const data = await this.usersService.getProfile(userId);
    return {
      data,
      __message: 'User profile retrieved successfully',
    };
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update profile information (name, phone)' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateMyProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    const data = await this.usersService.updateProfile(userId, dto);
    return {
      data,
      __message: 'Profile updated successfully',
    };
  }

  @Put('me/password')
  @ApiOperation({ summary: 'Change account password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    const data = await this.usersService.changePassword(userId, dto);
    return {
      data,
      __message: 'Password updated successfully',
    };
  }
}
