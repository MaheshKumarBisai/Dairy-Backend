import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Get platform-wide metrics and gross volume' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved' })
  async getPlatformMetrics() {
    const data = await this.adminService.getPlatformMetrics();
    return {
      data,
      __message: 'Platform metrics retrieved successfully',
    };
  }

  @Get('users')
  @ApiOperation({ summary: 'Admin lists all users with role filtering' })
  @ApiQuery({ name: 'role', enum: UserRole, required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Users list retrieved' })
  async listUsers(
    @Query('role') role?: UserRole,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const data = await this.adminService.listUsers(role, Number(page) || 1, Number(limit) || 20);
    return {
      data,
      __message: 'Users retrieved successfully',
    };
  }

  @Patch('users/:userId/active')
  @ApiOperation({ summary: 'Admin activates or deactivates a user' })
  @ApiResponse({ status: 200, description: 'User active state updated' })
  async toggleUserActive(
    @Param('userId') userId: string,
    @Body() body: { isActive: boolean },
  ) {
    const data = await this.adminService.toggleUserActive(userId, body.isActive);
    return {
      data,
      __message: 'User status updated successfully',
    };
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Admin inspects platform-wide audit log events' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved' })
  async listAuditLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const data = await this.adminService.listAuditLogs(Number(page) || 1, Number(limit) || 30);
    return {
      data,
      __message: 'Audit logs retrieved successfully',
    };
  }
}
