import { Test, TestingModule } from '@nestjs/testing';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

describe('DispatchController', () => {
  let dispatchController: DispatchController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [DispatchController],
      providers: [DispatchService],
    }).compile();

    dispatchController = app.get<DispatchController>(DispatchController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(dispatchController.getHello()).toBe('Hello World!');
    });
  });
});
