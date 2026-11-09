import { Prisma } from '@prisma/client';

/** 데모 pN() 과 동일한 초기 학습 기록 */
export function initialRecord(subjects: string[], plan: 'FREE' | 'PREMIUM') {
  const subj = subjects.map((name) => ({ name, accuracy: 0, progress: 0 }));
  const missions = [
    { id: 'm1', title: `${subj[0]?.name ?? '핵심 이론'} 첫 학습 30분`, minutes: 30, done: false, priority: true },
    { id: 'm2', title: `${subj[1]?.name ?? '개념'} 훑어보기 30분`, minutes: 30, done: false },
    { id: 'm3', title: plan === 'FREE' ? '핵심 개념 복습 22분' : 'QUICK TEST로 현재 실력 확인', minutes: 22, done: false },
  ];
  return { subjects: subj as unknown as Prisma.InputJsonValue, missions: missions as unknown as Prisma.InputJsonValue };
}
