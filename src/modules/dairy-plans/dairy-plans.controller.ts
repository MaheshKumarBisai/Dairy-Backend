import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DairyPlansService } from './dairy-plans.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateDairyPlanDto,
  UpdateDairyPlanDto,
  SkipDeliveryDto,
  ExtraDeliveryDto,
} from './dto/dairy-plan.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Dairy Plans')
@ApiBearerAuth()
@Controller('dairy-plans')
export class DairyPlansController {
  constructor(private readonly dairyPlansService: DairyPlansService) {}

  @Post()
  @ApiOperation({ summary: 'Customer creates recurring dairy subscription' })
  @ApiResponse({ status: 201, description: 'Dairy plan created' })
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateDairyPlanDto,
  ) {
    const data = await this.dairyPlansService.create(userId, dto);
    return {
      data,
      __message: 'Dairy subscription plan created successfully',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Customer lists all their recurring dairy plans' })
  @ApiResponse({ status: 200, description: 'Dairy plans retrieved' })
  async listForCustomer(@CurrentUser('userId') userId: string) {
    const data = await this.dairyPlansService.listForCustomer(userId);
    return {
      data,
      __message: 'Dairy plans retrieved successfully',
    };
  }

  @Get(':planId')
  @ApiOperation({ summary: 'Get dairy plan details by DP-100001 ID' })
  @ApiResponse({ status: 200, description: 'Dairy plan details' })
  async getById(
    @Param('planId') planId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.dairyPlansService.getById(planId, user);
    return {
      data,
      __message: 'Dairy plan details retrieved successfully',
    };
  }

  @Post(':planId/skip')
  @ApiOperation({ summary: 'Skip tomorrow’s delivery (Section 18)' })
  @ApiResponse({ status: 200, description: 'Delivery skipped for the day' })
  async skipDelivery(
    @Param('planId') planId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: SkipDeliveryDto,
  ) {
    const data = await this.dairyPlansService.skipDelivery(planId, userId, dto);
    return {
      data,
      __message: data.message,
    };
  }

  @Post(':planId/extra-delivery')
  @ApiOperation({ summary: 'Add extra quantity for tomorrow/target date (Section 18)' })
  @ApiResponse({ status: 200, description: 'Extra delivery scheduled' })
  async addExtraDelivery(
    @Param('planId') planId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: ExtraDeliveryDto,
  ) {
    const data = await this.dairyPlansService.addExtraDelivery(planId, userId, dto);
    return {
      data,
      __message: data.message,
    };
  }

  @Post(':planId/pause')
  @ApiOperation({ summary: 'Pause subscription plan deliveries' })
  @ApiResponse({ status: 200, description: 'Plan paused' })
  async pausePlan(
    @Param('planId') planId: string,
    @CurrentUser('userId') userId: string,
  ) {
    const data = await this.dairyPlansService.pausePlan(planId, userId);
    return {
      data,
      __message: 'Dairy plan paused successfully',
    };
  }

  @Post(':planId/resume')
  @ApiOperation({ summary: 'Resume paused subscription plan' })
  @ApiResponse({ status: 200, description: 'Plan resumed' })
  async resumePlan(
    @Param('planId') planId: string,
    @CurrentUser('userId') userId: string,
  ) {
    const data = await this.dairyPlansService.resumePlan(planId, userId);
    return {
      data,
      __message: 'Dairy plan resumed successfully',
    };
  }

  @Patch(':planId')
  @ApiOperation({ summary: 'Update plan quantities or delivery days' })
  @ApiResponse({ status: 200, description: 'Plan updated' })
  async updatePlan(
    @Param('planId') planId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateDairyPlanDto,
  ) {
    const data = await this.dairyPlansService.updatePlan(planId, userId, dto);
    return {
      data,
      __message: 'Dairy plan updated successfully',
    };
  }

  @Post(':planId/cancel')
  @ApiOperation({ summary: 'Cancel subscription plan permanently' })
  @ApiResponse({ status: 200, description: 'Plan cancelled' })
  async cancelPlan(
    @Param('planId') planId: string,
    @CurrentUser('userId') userId: string,
  ) {
    const data = await this.dairyPlansService.cancelPlan(planId, userId);
    return {
      data,
      __message: 'Dairy plan cancelled successfully',
    };
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/trigger-scheduler')
  @ApiOperation({ summary: 'Admin triggers daily order generation job manually' })
  @ApiResponse({ status: 200, description: 'Job executed' })
  async triggerScheduler(@Body() body: { date?: string }) {
    const data = await this.dairyPlansService.generateDailyOrders(body?.date);
    return {
      data,
      __message: 'Daily recurring orders generated successfully',
    };
  }
}
