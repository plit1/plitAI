import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsEmail, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ConsentType } from '@prisma/client';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

export class SignupDto {
  @ApiProperty() @IsEmail() @MaxLength(254) email: string;
  @ApiProperty({ description: '영문+숫자 포함 8~64자' }) @Matches(PASSWORD_RULE, { message: '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.' }) password: string;
  @ApiProperty() @IsString() @Length(2, 12) nickname: string;
  @ApiProperty({ enum: ConsentType, isArray: true, description: 'TERMS, PRIVACY, AGE_14 필수' })
  @IsArray() @ArrayNotEmpty() @IsEnum(ConsentType, { each: true }) consents: ConsentType[];
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(4, 16) referralCode?: string;
  @ApiPropertyOptional({ description: '초대 링크에 담긴 챌린지 회차' }) @IsOptional() @IsString() @Length(1, 80) inviteOfferingId?: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MaxLength(128) password: string;
}

export class PasswordResetRequestDto { @ApiProperty() @IsEmail() email: string; }
export class PasswordResetConfirmDto {
  @ApiProperty() @IsString() @Length(20, 200) token: string;
  @ApiProperty() @Matches(PASSWORD_RULE, { message: '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.' }) password: string;
}

export class MfaCodeDto { @ApiProperty({ example: '123456' }) @Matches(/^\d{6}$/, { message: '6자리 숫자를 입력해주세요.' }) code: string; }
export class MfaLoginDto extends MfaCodeDto { @ApiProperty() @IsString() @Length(20, 2000) mfaToken: string; }
