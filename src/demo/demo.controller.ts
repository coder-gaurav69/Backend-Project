import { Controller, Post, Get, Res } from '@nestjs/common';
import { DemoService } from './demo.service';
import { Response } from 'express';
import * as fs from 'fs';

@Controller('demo')
export class DemoController {
    constructor(private demoService: DemoService) { }

    @Post('run')
    async runDemo() {
        return this.demoService.runDemo();
    }
}
