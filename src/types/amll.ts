/**
 * @fileoverview AMLL 所使用的较简单的数据结构
 */

/**
 * 一个歌词单词
 */
export interface AmllLyricWord {
	/** 单词的起始时间 */
	startTime: number;
	/** 单词的结束时间 */
	endTime: number;
	/** 单词 */
	word: string;
	/** 单词的音译 */
	romanWord: string;
}

/**
 * 一行歌词，存储多个单词
 */
export interface AmllLyricLine {
	/**
	 * 该行的所有单词
	 */
	words: AmllLyricWord[];
	/**
	 * 该行的翻译
	 */
	translatedLyric: string;
	/**
	 * 该行的音译
	 */
	romanLyric: string;
	/**
	 * 该行是否为背景歌词行
	 */
	isBG: boolean;
	/**
	 * 该行是否为对唱歌词行（即歌词行靠右对齐）
	 */
	isDuet: boolean;
	/**
	 * 该行的开始时间
	 *
	 * **并不总是等于第一个单词的开始时间**
	 */
	startTime: number;
	/**
	 * 该行的结束时间
	 *
	 * **并不总是等于最后一个单词的开始时间**
	 */
	endTime: number;
}

export interface AmllMetadata {
	key: string;
	value: string[];
}

export interface AmllImportOptions {
	/** 歌词的主语言 (如 'ja') */
	mainLanguage?: string;
	/** 翻译的目标语言 (如 'zh-Hans') */
	translationLanguage?: string;
	/** 音译的目标语言 (如 'ja-Latn') */
	romanizationLanguage?: string;
}
