export interface ContentPart {
    text?: string;
    inlineData?: {
        mimeType: string;
        data: string;
    };
}

export interface ContentItem {
    role: 'user' | 'model';
    parts: ContentPart[];
}

export interface ValidationResult {
    valid: boolean;
    error?: string;
    sanitized?: ContentItem[];
}

export interface GeminiGenerateOptions {
    contents: ContentItem[];
    systemPrompt: string;
    maxOutputTokens: number;
    temperature: number;
}

export interface GeminiClientResult {
    status: number;
    data: any;
}
