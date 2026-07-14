import type { ListSection, MessagingPort, ReplyButton } from "../domain/ports.js";

export interface MetaCloudApiConfig {
  phoneNumberId: string;
  accessToken: string;
  graphApiVersion: string;
}

/** Adapter for Meta's WhatsApp Cloud API. Implements the MessagingPort so the
 * conversation engine has no idea which provider is actually sending messages —
 * swapping to Twilio later means writing one more adapter, not touching the engine. */
export class MetaCloudApiClient implements MessagingPort {
  constructor(private readonly config: MetaCloudApiConfig) {}

  async sendText(to: string, body: string): Promise<void> {
    await this.post({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    });
  }

  async sendList(
    to: string,
    params: { bodyText: string; buttonText: string; sections: ListSection[] },
  ): Promise<void> {
    await this.post({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: params.bodyText },
        action: {
          button: params.buttonText,
          sections: params.sections.map((section) => ({
            title: section.title,
            rows: section.rows.map((row) => ({
              id: row.id,
              title: row.title,
              description: row.description,
            })),
          })),
        },
      },
    });
  }

  async sendButtons(to: string, params: { bodyText: string; buttons: ReplyButton[] }): Promise<void> {
    await this.post({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: params.bodyText },
        action: {
          buttons: params.buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    });
  }

  async sendTemplate(
    to: string,
    params: { name: string; language: string; bodyParams?: string[] },
  ): Promise<void> {
    await this.post({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: params.name,
        language: { code: params.language },
        ...(params.bodyParams?.length
          ? {
              components: [
                {
                  type: "body",
                  parameters: params.bodyParams.map((text) => ({ type: "text", text })),
                },
              ],
            }
          : {}),
      },
    });
  }

  private async post(body: unknown): Promise<void> {
    const url = `https://graph.facebook.com/${this.config.graphApiVersion}/${this.config.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`WhatsApp Cloud API request failed (${response.status}): ${errorBody}`);
    }
  }
}
