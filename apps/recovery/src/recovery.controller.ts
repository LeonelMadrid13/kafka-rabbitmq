import { Controller } from '@nestjs/common';
import { RecoveryService } from './recovery.service';

@Controller()
export class RecoveryController {
  constructor(private readonly recoveryService: RecoveryService) {}
}
