import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import type { TemplateEntry } from './registry'

interface ConciergeRequestProps {
  customerEmail?: string
  message?: string
  log?: string
}

export function ConciergeRequestEmail({
  customerEmail = 'unknown@example.com',
  message = 'Hello, I ran into an issue while configuring my diffuser. Please see the log below and come back to me as soon as possible.',
  log = 'No log captured.',
}: ConciergeRequestProps) {
  return (
    <Html>
      <Head />
      <Preview>Concierge request from {customerEmail}</Preview>
      <Body style={{ backgroundColor: '#000000', color: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container style={{ padding: '24px' }}>
          <Heading style={{ fontSize: '18px', color: '#ffe49d' }}>Concierge request</Heading>
          <Text style={{ fontSize: '14px' }}>From: {customerEmail}</Text>
          <Text style={{ fontSize: '14px' }}>{message}</Text>
          <Section>
            <Text style={{ fontSize: '12px', color: '#bbbbbb' }}>Debug log</Text>
            <Text
              style={{
                fontSize: '11px',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                color: '#dddddd',
              }}
            >
              {log}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ConciergeRequestEmail,
  displayName: 'Concierge request',
  subject: (data: Record<string, any>) =>
    `Brume concierge request — ${data['customerEmail'] ?? 'customer'}`,
  to: 'contact@brume.me',
  previewData: {
    customerEmail: 'customer@example.com',
    message: 'Hello, I ran into an issue while configuring my diffuser.',
    log: '0ms Push start\n120ms TX 0x14\n140ms write ok',
  },
} satisfies TemplateEntry
