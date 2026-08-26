import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  afterInit() {
    this.logger.log('🚀 GABAI Realtime WebSocket Gateway initialized on namespace /realtime');
  }

  handleConnection(client: Socket) {
    this.logger.log(`📱 Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`🔌 Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: any): string {
    return 'pong';
  }

  // Broadcasters used by other services
  broadcastHazardNew(hazard: any) {
    this.server.emit('hazard:new', hazard);
  }

  broadcastHazardUpdated(hazard: any) {
    this.server.emit('hazard:updated', hazard);
  }

  broadcastReportNew(report: any) {
    this.server.emit('report:new', report);
  }

  broadcastReportStatus(report: any) {
    this.server.emit('report:status_changed', report);
  }

  broadcastAiAlert(alert: any) {
    this.server.emit('ai:pattern_alert', alert);
  }
}
