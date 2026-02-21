export type * from "./amll";

/**
 * 解析器配置选项
 */
export interface TTMLParserOptions {
	/**
	 * 注入的 DOMParser 实例
	 * - 浏览器环境: 可忽略，默认使用 window.DOMParser
	 * - Node.js 环境: 必须传入 (例如: `new (require('@xmldom/xmldom').DOMParser)()`)
	 */
	domParser?: {
		parseFromString(string: string, type: DOMParserSupportedType): Document;
	};
}

/**
 * 生成器配置选项
 */
export interface GeneratorOptions {
	/**
	 * 注入的 DOMImplementation 实例
	 * - 浏览器: 可忽略，默认使用 document.implementation
	 * - Node.js 环境: 必须传入 (例如: `new (require('@xmldom/xmldom').DOMImplementation)()`)
	 */
	domImplementation?: DOMImplementation;

	/**
	 * 注入的 XMLSerializer 实例
	 * - 浏览器: 可忽略，默认使用 new XMLSerializer()
	 * - Node.js 环境: 必须传入 (例如: `new (require('@xmldom/xmldom').XMLSerializer)()`)
	 */
	xmlSerializer?: XMLSerializer;

	/**
	 * 对于逐行翻译/音译，是否将其放入 Head (Apple Music 风格)
	 *
	 * 注意逐字翻译/音译将始终强制放入 Head，无论此值如何
	 *
	 * 默认为 false
	 */
	useSidecar?: boolean;
}

/**
 * 翻译/音译的内容
 */
export interface TranslatedContent {
	/**
	 * 该内容的 BCP-47 语言代码
	 */
	language?: string;

	/**
	 * 完整文本
	 */
	text: string;

	/**
	 * 逐字音节信息
	 */
	words?: Syllable[];

	/**
	 * 嵌套的背景人声翻译/音译内容
	 */
	backgroundVocals?: TranslatedContent[];
}

/**
 * 基础歌词内容
 */
export interface LyricBase {
	/**
	 * 完整的文本内容
	 * - 如果是逐字歌词，这里是所有字拼接后的结果
	 */
	text: string;

	/**
	 * 开始时间，单位毫秒
	 */
	startTime: number;

	/**
	 * 结束时间，单位毫秒
	 */
	endTime: number;

	/**
	 * 逐字音节信息
	 *
	 * 如果数组为空或未定义，一般就是逐行歌词
	 */
	words?: Syllable[];

	/**
	 * 翻译内容
	 */
	translations?: TranslatedContent[];

	/**
	 * 音译内容
	 */
	romanizations?: TranslatedContent[];

	/**
	 * 背景人声内容
	 */
	backgroundVocals?: LyricBase[];
}

/**
 * 一个主歌词行
 */
export interface LyricLine extends LyricBase {
	/**
	 * 行 ID
	 *
	 * 例如 "L1", "L2"...
	 */
	id: string;

	/**
	 * 演唱者 ID
	 *
	 * 可用于在 metadata.agents 中查找具体名字
	 */
	agentId?: string;

	/**
	 * 歌曲结构组成
	 *
	 * 例如: "Verse", "Chorus", "Intro", "Outro"
	 */
	songPart?: string;
}

/**
 * 一个歌词音节
 */
export interface Syllable {
	/**
	 * 该音节的内容
	 */
	text: string;

	/**
	 * 该音节的开始时间，单位毫秒
	 */
	startTime: number;

	/**
	 * 该音节的结束时间，单位毫秒
	 */
	endTime: number;

	/**
	 * 该音节后面是否应该跟着一个空格
	 *
	 * 注意必须根据此标志在歌词后面添加空格，text 中不应包含空格
	 */
	endsWithSpace?: boolean;
}

/**
 * 演唱者信息结构
 */
export interface Agent {
	/**
	 * 演唱者的 ID
	 *
	 * 如果是 AMLL 的 TTML，只有 v1 和 v2 分别指代非对唱和对唱。
	 * 如果是 Apple Music 的 TTML，还会出现 v3，v4 等指代每个演唱者，以及 v1000 用于指代合唱。
	 */
	id: string;

	/**
	 * 演唱者名称
	 */
	name?: string;
}

/**
 * 元数据中的各个平台 ID
 */
export type PlatformId =
	| "ncmMusicId"
	| "qqMusicId"
	| "spotifyId"
	| "appleMusicId";

/**
 * TTML 歌词的元数据内容
 */
export interface TTMLMetadata {
	/**
	 * 歌词主语言代码 (BCP-47)
	 */
	language?: string;

	/**
	 * 计时模式
	 */
	timingMode?: "Word" | "Line";

	/**
	 * 歌曲创作者列表
	 */
	songwriters?: string[];

	/**
	 * 歌曲标题列表
	 */
	title?: string[];

	/**
	 * 艺术家名称列表
	 */
	artist?: string[];

	/**
	 * 专辑名称列表
	 */
	album?: string[];

	/**
	 * ISRC 号码列表
	 */
	isrc?: string[];

	/**
	 * 歌词作者 GitHub 数字 ID 列表
	 */
	authorIds?: string[];

	/**
	 * 歌词作者 GitHub 用户名列表
	 */
	authorNames?: string[];

	/**
	 * 演唱者映射表
	 */
	agents: Record<string, Agent>;

	/**
	 * 平台关联 ID
	 */
	platformIds?: Partial<Record<PlatformId, string[]>>;

	/**
	 * 其他原始的自定义属性
	 */
	rawProperties?: Record<string, string>;
}

/**
 * 解析器返回的结果对象
 */
export interface TTMLResult {
	/**
	 * TTML 歌词的元数据内容
	 */
	metadata: TTMLMetadata;

	/**
	 * 所有的歌词行
	 */
	lines: LyricLine[];
}
