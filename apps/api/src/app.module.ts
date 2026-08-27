import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AjustesController } from './ajustes.controller';
import { BillingController } from './billing.controller';
import { AuthGuard, ServicioActivoGuard, TableScopeGuard, TrialGuard } from './auth';
import { RateLimitGuard } from './rate-limit.guard';
import { AuthController } from './auth.controller';
import { HealthController } from './health.controller';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { TablesController } from './tables.controller';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import { CatalogService } from './catalog.service';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { MenuController } from './menu.controller';
import { OrdersController } from './orders.controller';
import { MetricsController } from './metrics.controller';
import { OrdersService } from './orders.service';
import { ArchiveService } from './archive.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { TenantsService } from './tenants.service';
import { ResetsService } from './resets.service';
import { GoogleService } from './google.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  controllers: [MenuController, OrdersController, ImagesController, SessionsController, BillsController, MetricsController, AuthController, TablesController, StaffController, HealthController, CallsController, BillingController, AjustesController],
  providers: [CatalogService, OrdersService, ArchiveService, ImagesService, SessionsService, BillsService, StaffService, TenantsService, ResetsService, GoogleService, CallsService, RealtimeGateway,
    // First: cheap, and a flood should be turned away before any lookup.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    // Applied globally: an endpoint is protected unless it opts out with @Public.
    { provide: APP_GUARD, useClass: AuthGuard },
    // Runs second, so a staff session is already resolved when it checks scope.
    { provide: APP_GUARD, useClass: TableScopeGuard },
    // Last: the session is resolved by now, and only config changes are gated.
    { provide: APP_GUARD, useClass: TrialGuard },
    // Y al final el servicio: corta los pedidos de un local suspendido, que es
    // lo último que se corta y lo único que el comensal llega a notar.
    { provide: APP_GUARD, useClass: ServicioActivoGuard },
  ],
})
export class AppModule {}
