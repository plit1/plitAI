import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/auth.decorators';
import { PolicyService } from './policy.service';

@ApiTags('policy')
@Controller('policy')
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}

  /** 상품 안내 화면용 공개 정책 (가격·보상·기능 구성) */
  @Public()
  @Get('plans')
  async plans() {
    const { version, values } = await this.policy.current();
    return {
      policyVersion: version,
      plans: [
        { plan: 'FREE', type: 'TOGETHER_RUN', label: '플릿런', labelEn: 'PLIT RUN', price: 0, reward: values.togetherReward, features: values.freeFeatures },
        { plan: 'PREMIUM', type: 'BOOSTER_RUN', label: '플릿 부스터 패스', labelEn: 'PLIT BOOSTER PASS', price: values.passPrice, vatIncluded: true, perExamRound: true, reward: values.boosterReward, features: 'ALL' },
      ],
      refundDays: values.refundDays,
      retryEnabled: values.retryEnabled,
    };
  }
}
