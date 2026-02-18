import { Test, TestingModule } from '@nestjs/testing';
import { TaskApiService } from './task-api.service';

describe('TaskApiService', () => {
  let service: TaskApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskApiService],
    }).compile();

    service = module.get<TaskApiService>(TaskApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
