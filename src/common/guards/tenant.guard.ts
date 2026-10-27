import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User authentication context missing');
    }

    // Platform Admin has cross-tenant access for oversight/management
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    if (user.role === UserRole.MERCHANT) {
      if (!user.merchantId) {
        throw new ForbiddenException('Merchant profile is not linked or inactive for this user');
      }

      // Check if client tried to spoof or request a different merchantId in params, query, or body
      const requestedMerchantId =
        request.params?.merchantId ||
        request.query?.merchantId ||
        request.body?.merchantId;

      if (requestedMerchantId && requestedMerchantId !== user.merchantId) {
        throw new ForbiddenException(
          `Tenant Isolation Violation: You are not authorized to access or mutate data belonging to merchant ${requestedMerchantId}`,
        );
      }

      // Forcefully bind authenticated merchantId to request for all downstream handler operations
      request.tenantId = user.merchantId;
      return true;
    }

    return true;
  }
}
