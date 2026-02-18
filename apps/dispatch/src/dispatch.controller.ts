import { Controller } from '@nestjs/common';
import { DispatchService } from './dispatch.service';

@Controller()
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}
}
