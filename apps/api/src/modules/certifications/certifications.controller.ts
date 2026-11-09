import { Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser, Public } from '../../common/auth.decorators';
import { NotFound } from '../../common/errors';
import { PrismaService } from '../../common/prisma.service';

/** 데모의 분야 분류 (yf) */
export const FIELDS = [
  { id: 'care', label: '돌봄·건강' }, { id: 'beauty', label: '뷰티' }, { id: 'food', label: '카페·푸드' }, { id: 'life', label: '라이프' },
  { id: 'office', label: '사무·IT' }, { id: 'edu', label: '교육' }, { id: 'biz', label: '비즈니스' }, { id: 'lang', label: '어학' },
];
/** 마스터 프롬프트 분류(국가기술/국가전문/민간) ↔ 데모 qualType 매핑 */
export const QUAL_GROUPS: Record<string, string[]> = {
  NATIONAL_TECH: ['국가기술'],
  NATIONAL_PRO: ['국가전문', '국가자격'],
  PRIVATE: ['민간', '국가공인 민간', '국가공인'],
  LANGUAGE: ['어학'],
};

class SearchQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) q?: string;
  @ApiPropertyOptional({ enum: FIELDS.map((f) => f.id) }) @IsOptional() @IsIn(FIELDS.map((f) => f.id)) field?: string;
  @ApiPropertyOptional({ enum: Object.keys(QUAL_GROUPS) }) @IsOptional() @IsIn(Object.keys(QUAL_GROUPS)) group?: string;
  @ApiPropertyOptional({ enum: ['popular', 'name', 'difficulty'] }) @IsOptional() @IsIn(['popular', 'name', 'difficulty']) sort?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) take?: number;
}

@ApiTags('certifications')
@Controller('certifications')
export class CertificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('meta')
  meta() { return { fields: FIELDS, groups: Object.keys(QUAL_GROUPS) }; }

  @Public()
  @Get()
  async search(@Query() q: SearchQuery) {
    const where: Prisma.CertificationWhereInput = { isActive: true };
    if (q.field) where.field = q.field;
    if (q.group) where.qualType = { in: QUAL_GROUPS[q.group] };
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { tagline: { contains: q.q, mode: 'insensitive' } }, { issuer: { contains: q.q } }];
    const certs = await this.prisma.certification.findMany({
      where, take: q.take ?? 100,
      orderBy: q.sort === 'difficulty' ? { difficulty: 'asc' } : { name: 'asc' },
      include: { offerings: { where: { hidden: false, status: { in: ['open', 'closed', 'running'] } }, orderBy: { examDate: 'asc' }, take: 1 } },
    });
    const items = certs.map(({ offerings, ...c }) => {
      const o = offerings[0];
      return { ...c, nextOffering: o ? { id: o.id, round: o.round, recruitEnd: o.recruitEnd, examDate: o.examDate, status: o.status, challengers: o.freeJoined + o.premiumJoined, popularity: o.popularity } : null };
    });
    if (q.sort === 'popular' || !q.sort) items.sort((a, b) => (b.nextOffering?.popularity ?? 0) - (a.nextOffering?.popularity ?? 0));
    return { items, total: items.length };
  }

  @Public()
  @Get(':id')
  async detail(@Param('id') id: string) {
    const cert = await this.prisma.certification.findUnique({
      where: { id },
      include: { offerings: { where: { hidden: false }, orderBy: { examDate: 'asc' } }, examRounds: { orderBy: { examDate: 'asc' } } },
    });
    if (!cert) throw NotFound('자격증');
    const [favorites, enrolled, passed] = await Promise.all([
      this.prisma.favoriteCertification.count({ where: { certId: id } }),
      this.prisma.enrollment.count({ where: { certId: id } }),
      this.prisma.passVerification.count({ where: { status: 'APPROVED', enrollment: { certId: id } } }),
    ]);
    return { ...cert, stats: { favorites, challengers: enrolled, verifiedPasses: passed } };
  }

  @ApiBearerAuth() @HttpCode(204)
  @Put(':id/favorite')
  async addFavorite(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    if (!(await this.prisma.certification.findUnique({ where: { id } }))) throw NotFound('자격증');
    await this.prisma.favoriteCertification.upsert({ where: { userId_certId: { userId: u.id, certId: id } }, create: { userId: u.id, certId: id }, update: {} });
  }

  @ApiBearerAuth() @HttpCode(204)
  @Delete(':id/favorite')
  async removeFavorite(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.prisma.favoriteCertification.deleteMany({ where: { userId: u.id, certId: id } });
  }
}

@ApiTags('me')
@ApiBearerAuth()
@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    return this.prisma.favoriteCertification.findMany({ where: { userId: u.id }, include: { cert: true }, orderBy: { createdAt: 'desc' } });
  }
}
