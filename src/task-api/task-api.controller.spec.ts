import { Test, TestingModule } from '@nestjs/testing';
import { TaskApiController } from './task-api.controller';

describe('TaskApiController', () => {
  let controller: TaskApiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaskApiController],
    }).compile();

    controller = module.get<TaskApiController>(TaskApiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
