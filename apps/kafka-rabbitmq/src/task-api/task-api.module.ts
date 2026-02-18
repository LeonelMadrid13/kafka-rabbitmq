import { Module } from '@nestjs/common';
import { TaskApiService } from './task-api.service';
import { TaskApiController } from './task-api.controller';

@Module({
  providers: [TaskApiService],
  controllers: [TaskApiController]
})
export class TaskApiModule {}
