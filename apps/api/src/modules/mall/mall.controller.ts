import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public, Roles } from '../../common/auth.decorators';
import { MallService } from './mall.service';

class ExchangeDto {
  @ApiProperty() @IsString() productId: string;
  @ApiProperty({ description: '같은 교환 요청 재시도 시 같은 값 (중복 차감 방지)' }) @IsString() @Matches(/^[A-Za-z0-9_-]{8,64}$/) idempotencyKey: string;
}
class ProductDto {
  @ApiProperty() @IsString() @Matches(/^[a-z0-9-]{3,40}$/) id: string;
  @ApiProperty() @IsString() category: string;
  @ApiProperty() @IsString() @Length(1, 40) brand: string;
  @ApiProperty() @IsString() @Length(1, 80) name: string;
  @ApiProperty() @IsInt() price: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() stock: number | null;
  @ApiProperty() @IsInt() @Min(1) @Max(20) perUserDaily: number;
  @ApiProperty() @IsString() supplier: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierSku?: string;
  @ApiProperty() @IsIn(['ACTIVE', 'HIDDEN']) status: 'ACTIVE' | 'HIDDEN';
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}
class CancelDto { @ApiProperty() @IsString() @Length(2, 200) reason: string; }

@ApiTags('mall')
@Controller()
export class MallController {
  constructor(private readonly svc: MallService) {}
  @Public() @Get('mall/products') products(@Query('category') c?: string) { return this.svc.products(c); }
  @ApiBearerAuth() @Post('mall/exchange') exchange(@CurrentUser() u: AuthUser, @Body() dto: ExchangeDto) { return this.svc.exchange(u.id, dto.productId, dto.idempotencyKey); }
  @ApiBearerAuth() @Get('me/mall/orders') orders(@CurrentUser() u: AuthUser) { return this.svc.myOrders(u.id); }
  @ApiBearerAuth() @Get('me/mall/orders/:id') order(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.myOrder(u.id, id); }

  @Roles('OPERATOR') @Get('admin/mall/products') adminProducts() { return this.svc.adminProducts(); }
  @Roles('OPERATOR') @Get('admin/mall/suppliers') suppliers() { return this.svc.suppliers(); }
  @Roles('SUPER_ADMIN') @Put('admin/mall/products') upsert(@CurrentUser() u: AuthUser, @Body() dto: ProductDto, @Req() r: Request) { return this.svc.adminUpsertProduct(u.id, { ...dto, stock: dto.stock ?? null }, r.ip); }
  @Roles('OPERATOR') @Get('admin/mall/orders') adminOrders(@Query('status') s?: string) { return this.svc.adminOrders(s); }
  @Roles('SUPER_ADMIN') @Post('admin/mall/recover') recover() { return this.svc.recoverStuck(); }
  @Roles('OPERATOR') @Post('admin/mall/orders/:id/cancel') cancel(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CancelDto, @Req() r: Request) { return this.svc.adminCancel(u.id, id, dto.reason, r.ip); }
}
