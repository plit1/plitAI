import { Module } from '@nestjs/common';
import { CommunityModule } from '../community/community.module';
import { StudyRoomController } from './study-room.controller';
import { StudyRoomGateway } from './study-room.gateway';
import { StudyRoomService } from './study-room.service';
@Module({ imports: [CommunityModule], providers: [StudyRoomService, StudyRoomGateway], controllers: [StudyRoomController], exports: [StudyRoomService] })
export class StudyRoomModule {}
