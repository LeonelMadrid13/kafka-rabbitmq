import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TaskApiService } from './task-api.service';

@Controller('tasks')
export class TaskApiController {
  constructor(private readonly taskApiService: TaskApiService) {}

  @Post()
  async createTask(@Body() payload: any) {
    try {
      const taskId = await this.taskApiService.createTask(payload);

      return {
        success: true,
        taskId,
        message: 'Task accepted',
      };
    } catch (error) {
      throw new HttpException(
        'Failed to create task',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
