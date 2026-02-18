import { Test, TestingModule } from '@nestjs/testing';
import { RecoveryController } from './recovery.controller';
import { RecoveryService } from './recovery.service';

describe('RecoveryController', () => {
  let recoveryController: RecoveryController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [RecoveryController],
      providers: [RecoveryService],
    }).compile();

    recoveryController = app.get<RecoveryController>(RecoveryController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(recoveryController.getHello()).toBe('Hello World!');
    });
  });
});
