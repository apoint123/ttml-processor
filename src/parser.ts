import { Attributes, Elements, NodeType, NS, Values } from "./constants";
import type {
	Agent,
	AmllLyricLine,
	AmllLyricWord,
	LyricBase,
	LyricLine,
	Syllable,
	TranslatedContent,
	TTMLMetadata,
	TTMLParserOptions,
	TTMLResult,
} from "./types";

/**
 * 临时的用于关联 Apple Music 样式的翻译和音译与主歌词行的容器
 */
interface IExtensionSidecar {
	[lineId: string]: {
		translations?: TranslatedContent[];
		romanizations?: TranslatedContent[];
	};
}

interface IParsedState {
	fullText: string;
	words: Syllable[];
	translations: TranslatedContent[];
	romanizations: { text: string; language?: string }[];
	backgroundVocals: LyricBase[];
}

export class TTMLParser {
	private domParser: DOMParser;

	private static readonly TIME_REGEX =
		/^(?:(?:(\d+):)?(\d+):)?(\d+(?:\.\d+)?)$/;
	private static readonly LEADING_SPACE_REGEX = /^\s/;
	private static readonly TRAILING_SPACE_REGEX = /\s$/;
	private static readonly MULTI_SPACE_REGEX = /\s+/g;

	constructor(options?: TTMLParserOptions) {
		if (options?.domParser) {
			this.domParser = options.domParser;
		} else if (typeof DOMParser !== "undefined") {
			this.domParser = new DOMParser();
		} else {
			throw new Error(
				"No DOMParser found. If you are running in Node.js, please inject a DOMParser (e.g., @xmldom/xmldom).",
			);
		}
	}

	public static parse(xmlStr: string, options?: TTMLParserOptions): TTMLResult {
		const instance = new TTMLParser(options);
		return instance.parse(xmlStr);
	}

	public parse(xmlStr: string): TTMLResult {
		if (!xmlStr || typeof xmlStr !== "string") {
			throw new Error("TTMLParser: Input must be a valid XML string.");
		}

		const doc = this.domParser.parseFromString(xmlStr, Values.MimeXML);
		const { metadata, sidecar } = this.parseHead(doc);

		const parserError = doc.getElementsByTagName(Elements.ParserError)[0];
		if (parserError) {
			throw new Error(
				`TTMLParser: XML parsing error: ${parserError.textContent}`,
			);
		}

		const result: TTMLResult = {
			metadata: metadata,
			lines: [],
		};

		const root = doc.documentElement;
		if (root) {
			const lang = this.getAttr(root, NS.XML, Attributes.Lang);
			if (lang) {
				result.metadata.language = lang;
			}

			const timing = this.getAttr(root, NS.ITUNES, Attributes.Timing);
			if ((timing && timing === Values.Word) || timing === Values.Line) {
				result.metadata.timingMode = timing;
			}
		}

		this.parseBody(doc, result, sidecar);

		return result;
	}

	/**
	 * 将本解析器复杂的数据结构降级为 AMLL 所使用的较简单的数据结构
	 */
	public static toAmllLyrics(result: TTMLResult): AmllLyricLine[] {
		const amllLines: AmllLyricLine[] = [];

		const convertToAmllLine = (
			source: LyricBase,
			isBG: boolean,
			agentId: string = "v1",
		): AmllLyricLine => {
			let amllWords: AmllLyricWord[] = [];

			if (source.words && source.words.length > 0) {
				amllWords = source.words.map((w) => ({
					startTime: w.startTime,
					endTime: w.endTime,
					word: w.text + (w.endsWithSpace ? " " : ""),
					romanWord: "",
				}));
			} else {
				amllWords = [
					{
						startTime: source.startTime,
						endTime: source.endTime,
						word: source.text,
						romanWord: "",
					},
				];
			}

			let transText = "";
			if (source.translations && source.translations.length > 0) {
				transText = source.translations[0].text;
			}

			let romanText = "";
			let romanWords: Syllable[] | undefined;
			if (source.romanizations && source.romanizations.length > 0) {
				const val = source.romanizations[0];
				romanText = val.text;
				romanWords = val.words;
			}

			const isDuet = agentId !== "v1";

			if (romanWords && amllWords.length > 0) {
				TTMLParser.alignRomanization(amllWords, romanWords);
			}

			return {
				words: amllWords,
				translatedLyric: transText,
				romanLyric: romanText,
				isBG: isBG,
				isDuet: isDuet,
				startTime: source.startTime,
				endTime: source.endTime,
			};
		};

		for (const line of result.lines) {
			const amllMain = convertToAmllLine(line, false, line.agentId);
			amllLines.push(amllMain);

			if (line.backgroundVocals) {
				for (const bg of line.backgroundVocals) {
					const simpleBg = convertToAmllLine(bg, true, line.agentId);
					amllLines.push(simpleBg);
				}
			}
		}

		return amllLines;
	}

	private static alignRomanization(
		amllWords: AmllLyricWord[],
		romanWords: Syllable[],
	) {
		let i = 0;
		let j = 0;
		const TIME_TOLERANCE_MS = 30;

		while (i < amllWords.length && j < romanWords.length) {
			const main = amllWords[i];
			const sub = romanWords[j];

			if (Math.abs(main.startTime - sub.startTime) < TIME_TOLERANCE_MS) {
				main.romanWord = sub.text;
				i++;
				j++;
			} else if (sub.startTime < main.startTime) {
				j++;
			} else {
				i++;
			}
		}
	}

	private parseHead(doc: Document): {
		metadata: TTMLMetadata;
		sidecar: IExtensionSidecar;
	} {
		const head = doc.getElementsByTagName(Elements.Head)[0];

		const resultMeta: TTMLMetadata = {
			title: [],
			artist: [],
			album: [],
			isrc: [],
			authorIds: [],
			authorNames: [],
			songwriters: [],
			agents: {},
			rawProperties: {},
		};
		const sidecar: IExtensionSidecar = {};

		if (!head) {
			return { metadata: resultMeta, sidecar };
		}

		this.parseTTMElements(head, resultMeta);
		this.parseAMLLMeta(head, resultMeta);
		this.parseiTunesExtensions(head, resultMeta, sidecar);

		return { metadata: resultMeta, sidecar };
	}

	private parseTTMElements(head: Element, meta: TTMLMetadata) {
		const titles = head.getElementsByTagNameNS(NS.TTM, Elements.Title);
		if (titles.length > 0 && titles[0].textContent) {
			meta.title?.push(titles[0].textContent.trim());
		}

		const agents = Array.from(
			head.getElementsByTagNameNS(NS.TTM, Elements.Agent),
		);

		for (const agent of agents) {
			const id = this.getAttr(agent, NS.XML, Attributes.Id);

			if (!id) continue;

			const names = agent.getElementsByTagNameNS(NS.TTM, Elements.Name);

			const agentObj: Agent = {
				id: id,
			};

			if (names.length > 0 && names[0].textContent) {
				const rawName = names[0].textContent.trim();
				if (rawName.length > 0) {
					agentObj.name = rawName;
				}
			}

			meta.agents[id] = agentObj;
		}
	}

	private parseAMLLMeta(head: Element, meta: TTMLMetadata) {
		const metas = Array.from(
			head.getElementsByTagNameNS(NS.AMLL, Elements.Meta),
		);

		const validMetas = metas.filter((el) => {
			return (
				this.getAttr(el, NS.AMLL, Attributes.Key) &&
				this.getAttr(el, NS.AMLL, Attributes.Value)
			);
		});

		for (const el of validMetas) {
			const key = this.getAttr(el, NS.AMLL, Attributes.Key);
			const value = this.getAttr(el, NS.AMLL, Attributes.Value);

			if (!key || !value) continue;

			switch (key) {
				case Values.MusicName:
					meta.title?.push(value);
					break;
				case Values.Artists:
					meta.artist?.push(value);
					break;
				case Values.Album:
					meta.album?.push(value);
					break;
				case Values.ISRC:
					meta.isrc?.push(value);
					break;
				case Values.TTMLAuthorGithub:
					meta.authorIds?.push(value);
					break;
				case Values.TTMLAuthorGithubLogin:
					meta.authorNames?.push(value);
					break;
				case Values.NCMMusicId:
				case Values.QQMusicId:
				case Values.SpotifyId:
				case Values.AppleMusicId:
					if (!meta.platformIds) {
						meta.platformIds = {};
					}

					if (!meta.platformIds[key]) {
						meta.platformIds[key] = [];
					}

					meta.platformIds[key].push(value);
					break;
				default:
					if (!meta.rawProperties) meta.rawProperties = {};
					meta.rawProperties[key] = value;
					break;
			}
		}
	}

	private toTranslatedContent(base: LyricBase): TranslatedContent {
		const content: TranslatedContent = {
			text: base.text,
		};

		if (base.words && base.words.length > 0) {
			content.words = base.words;
		}

		if (base.backgroundVocals && base.backgroundVocals.length > 0) {
			content.backgroundVocals = base.backgroundVocals.map((bg) =>
				this.toTranslatedContent(bg),
			);
		}

		return content;
	}

	private parseiTunesExtensions(
		head: Element,
		meta: TTMLMetadata,
		sidecar: IExtensionSidecar,
	) {
		const iTunesMetas = Array.from(
			head.getElementsByTagName(Elements.ITunesMetadata),
		);
		if (iTunesMetas.length === 0) return;

		for (const iTunesMeta of iTunesMetas) {
			const songwritersContainer = iTunesMeta.getElementsByTagName(
				Elements.Songwriters,
			)[0];
			if (songwritersContainer) {
				const writers = Array.from(
					songwritersContainer.getElementsByTagName(Elements.Songwriter),
				);
				for (const writer of writers) {
					const name = writer.textContent?.trim();
					if (name) {
						meta.songwriters?.push(name);
					}
				}
			}

			const processEntries = (
				containerTagName: string,
				itemTagName: string,
				type: "translations" | "romanizations",
			) => {
				const container = iTunesMeta.getElementsByTagName(containerTagName)[0];
				if (!container) return;

				const items = Array.from(container.getElementsByTagName(itemTagName));
				for (const item of items) {
					const lang = this.getAttr(item, NS.XML, Attributes.Lang);

					const textNodes = Array.from(
						item.getElementsByTagName(Elements.Text),
					);
					for (const textNode of textNodes) {
						const forId = textNode.getAttribute(Attributes.For);
						const parsedContent = this.parseCommonContent(textNode);

						if (forId && parsedContent.text) {
							if (!sidecar[forId]) sidecar[forId] = {};
							if (!sidecar[forId][type]) sidecar[forId][type] = [];

							const content = this.toTranslatedContent(parsedContent);
							content.language = lang || undefined;

							sidecar[forId][type]?.push(content);
						}
					}
				}
			};

			processEntries(
				Elements.Translations,
				Elements.Translation,
				"translations",
			);
			processEntries(
				Elements.Transliterations,
				Elements.Transliteration,
				"romanizations",
			);
		}
	}

	private parseTime(timeStr: string | null): number {
		if (!timeStr) return 0;

		const cleanStr = timeStr.trim();
		if (cleanStr.length === 0) return 0;

		if (cleanStr.endsWith("s")) {
			const seconds = Number(cleanStr.slice(0, -1));
			if (Number.isNaN(seconds)) {
				return 0;
			}
			return Math.round(seconds * 1000);
		}

		const match = cleanStr.match(TTMLParser.TIME_REGEX);

		if (match) {
			const secStr = match[3];
			const minStr = match[2];
			const hrStr = match[1];

			const seconds = Number(secStr);
			const minutes = minStr ? parseInt(minStr, 10) : 0;
			const hours = hrStr ? parseInt(hrStr, 10) : 0;

			if (
				!Number.isNaN(seconds) &&
				!Number.isNaN(minutes) &&
				!Number.isNaN(hours)
			) {
				const totalSeconds = hours * 3600 + minutes * 60 + seconds;
				return Math.round(totalSeconds * 1000);
			}
		}
		return 0;
	}

	private parseBody(
		doc: Document,
		result: TTMLResult,
		sidecar: IExtensionSidecar,
	) {
		const body = doc.getElementsByTagName(Elements.Body)[0];
		if (!body) return;

		const childNodes = Array.from(body.childNodes);

		for (const node of childNodes) {
			if (node.nodeType !== NodeType.ELEMENT_NODE) continue;
			const el = node as Element;

			const tagName = el.localName || el.tagName.toLowerCase().split(":").pop();

			if (tagName === Elements.Div) {
				const songPart =
					this.getAttr(el, NS.ITUNES, Attributes.SongPartKebab) ||
					this.getAttr(el, NS.ITUNES, Attributes.SongPart);

				const pNodes = el.getElementsByTagNameNS(NS.TT, Elements.P);
				const pList =
					pNodes.length > 0
						? Array.from(pNodes)
						: Array.from(el.getElementsByTagName(Elements.P));

				for (const p of pList) {
					this.processLineElement(p, result.lines, sidecar, songPart);
				}
			} else if (tagName === Elements.P) {
				this.processLineElement(el, result.lines, sidecar);
			}
		}
	}

	private mergeSidecar<T extends LyricBase>(
		target: T,
		source: TranslatedContent[],
		field: "translations" | "romanizations",
	): T {
		const mergedField = [...(target[field] || []), ...source];

		if (!target.backgroundVocals || target.backgroundVocals.length === 0) {
			return {
				...target,
				[field]: mergedField,
			};
		}

		const mergedBackgroundVocals = target.backgroundVocals.map(
			(targetBg, index) => {
				const bgContentsToMerge = source.flatMap((srcItem) => {
					const srcBg = srcItem.backgroundVocals?.[index];
					if (!srcBg) return [];

					const bgContent: TranslatedContent = {
						language: srcItem.language,
						text: srcBg.text,
					};

					if (srcBg.words && srcBg.words.length > 0) {
						bgContent.words = srcBg.words;
					}
					if (srcBg.backgroundVocals && srcBg.backgroundVocals.length > 0) {
						bgContent.backgroundVocals = srcBg.backgroundVocals;
					}

					return [bgContent];
				});

				if (bgContentsToMerge.length === 0) {
					return targetBg;
				}

				return {
					...targetBg,
					[field]: [...(targetBg[field] || []), ...bgContentsToMerge],
				};
			},
		);

		return {
			...target,
			[field]: mergedField,
			backgroundVocals: mergedBackgroundVocals,
		};
	}

	private processLineElement(
		p: Element,
		lines: LyricLine[],
		sidecar: IExtensionSidecar,
		songPart?: string | null,
	) {
		const id = this.getAttr(p, NS.ITUNES, Attributes.Key);
		if (!id) return;

		const baseContent = this.parseCommonContent(p);

		let line: LyricLine = {
			id: id,
			...baseContent,
		};

		if (songPart) line.songPart = songPart;

		const agentId = this.getAttr(p, NS.TTM, Elements.Agent);
		if (agentId) line.agentId = agentId;

		const externalData = sidecar[id];
		if (externalData) {
			if (externalData.translations) {
				line = this.mergeSidecar(
					line,
					externalData.translations,
					"translations",
				);
			}
			if (externalData.romanizations) {
				line = this.mergeSidecar(
					line,
					externalData.romanizations,
					"romanizations",
				);
			}
		}

		lines.push(line);
	}

	private parseCommonContent(element: Element): LyricBase {
		const beginStr =
			this.getAttr(element, NS.XML, Attributes.Begin) ||
			element.getAttribute(Attributes.Begin);
		const endStr =
			this.getAttr(element, NS.XML, Attributes.End) ||
			element.getAttribute(Attributes.End);

		const initialState: IParsedState = {
			fullText: "",
			words: [],
			translations: [],
			romanizations: [],
			backgroundVocals: [],
		};

		const finalState = Array.from(element.childNodes).reduce((acc, node) => {
			if (node.nodeType === NodeType.TEXT_NODE) {
				return this.reduceTextNode(acc, node);
			} else if (node.nodeType === NodeType.ELEMENT_NODE) {
				return this.reduceElementNode(acc, node as Element);
			}
			return acc;
		}, initialState);

		const finalizedWords = this.finalizeWords(finalState.words);

		let calculatedStartTime = this.parseTime(beginStr);
		let calculatedEndTime = this.parseTime(endStr);

		const allTimedElements = [
			...finalizedWords,
			...finalState.backgroundVocals,
		];

		if (allTimedElements.length > 0) {
			const minChildStart = Math.min(
				...allTimedElements.map((e) => e.startTime),
			);
			const maxChildEnd = Math.max(...allTimedElements.map((e) => e.endTime));

			if (
				calculatedStartTime === 0 ||
				(minChildStart > 0 && minChildStart < calculatedStartTime)
			) {
				calculatedStartTime = minChildStart;
			}

			if (calculatedEndTime === 0 || maxChildEnd > calculatedEndTime) {
				calculatedEndTime = maxChildEnd;
			}
		}

		const cleanFullText = finalState.fullText
			.trim()
			.replace(TTMLParser.MULTI_SPACE_REGEX, " ");
		if (finalizedWords.length === 0 && cleanFullText.length > 0) {
			finalizedWords.push({
				text: cleanFullText,
				startTime: calculatedStartTime,
				endTime: calculatedEndTime,
				endsWithSpace: false,
			});
		}

		return {
			text: cleanFullText,
			startTime: calculatedStartTime,
			endTime: calculatedEndTime,
			words: finalizedWords.length > 0 ? finalizedWords : undefined,
			translations:
				finalState.translations.length > 0
					? finalState.translations
					: undefined,
			romanizations:
				finalState.romanizations.length > 0
					? finalState.romanizations
					: undefined,
			backgroundVocals:
				finalState.backgroundVocals.length > 0
					? finalState.backgroundVocals
					: undefined,
		};
	}

	private reduceTextNode(acc: IParsedState, node: Node): IParsedState {
		const rawText = node.textContent || "";
		const isFormatting = rawText.includes("\n");

		if (isFormatting && rawText.trim().length === 0) return acc;

		const normalizedText = rawText.replace(TTMLParser.MULTI_SPACE_REGEX, " ");

		acc.fullText += normalizedText;

		if (
			!isFormatting &&
			normalizedText.length > 0 &&
			normalizedText.trim().length === 0
		) {
			if (acc.words.length > 0) {
				acc.words[acc.words.length - 1].endsWithSpace = true;
			}
		}
		return acc;
	}

	private reduceElementNode(acc: IParsedState, el: Element): IParsedState {
		const role = this.getAttr(el, NS.TTM, Attributes.Role);

		switch (role) {
			case Values.RoleBg:
				acc.backgroundVocals.push(this.parseBackgroundVocal(el));
				return acc;
			case Values.RoleTranslation: {
				const translation = this.parseTranslation(el);
				if (translation) acc.translations.push(translation);
				return acc;
			}
			case Values.RoleRoman: {
				const romanization = this.parseRomanization(el);
				if (romanization) acc.romanizations.push(romanization);
				return acc;
			}
			default:
				return this.reduceWordElement(acc, el);
		}
	}

	private reduceWordElement(acc: IParsedState, el: Element): IParsedState {
		const wBegin =
			this.getAttr(el, NS.XML, Attributes.Begin) ||
			el.getAttribute(Attributes.Begin);
		const wEnd =
			this.getAttr(el, NS.XML, Attributes.End) ||
			el.getAttribute(Attributes.End);

		const rawWText = el.textContent || "";
		const normalizedWText = rawWText.replace(TTMLParser.MULTI_SPACE_REGEX, " ");

		acc.fullText += normalizedWText;

		if (wBegin && wEnd) {
			const isFormatting = rawWText.includes("\n");

			let startsWithSpace = false;
			let endsWithSpace = false;

			if (!isFormatting) {
				startsWithSpace = TTMLParser.LEADING_SPACE_REGEX.test(normalizedWText);
				endsWithSpace = TTMLParser.TRAILING_SPACE_REGEX.test(normalizedWText);
			}

			const cleanText = normalizedWText.trim();

			if (startsWithSpace && acc.words.length > 0) {
				acc.words[acc.words.length - 1].endsWithSpace = true;
			}

			if (cleanText.length > 0) {
				acc.words.push({
					text: cleanText,
					startTime: this.parseTime(wBegin),
					endTime: this.parseTime(wEnd),
					endsWithSpace: endsWithSpace,
				});
			}
		}
		return acc;
	}

	private parseBackgroundVocal(el: Element): LyricBase {
		const bgVocal = this.parseCommonContent(el);

		const stripParens = (str: string) =>
			str.replace(/^[(（]+/, "").replace(/[)）]+$/, "");

		return {
			...bgVocal,
			text: stripParens(bgVocal.text),
			words: bgVocal.words?.map((word) => ({
				...word,
				text: stripParens(word.text),
			})),
		};
	}

	private parseTranslation(el: Element): TranslatedContent | null {
		const lang = this.getAttr(el, NS.XML, Attributes.Lang);
		const parsed = this.parseCommonContent(el);

		if (
			parsed.text ||
			(parsed.backgroundVocals && parsed.backgroundVocals.length > 0)
		) {
			const content = this.toTranslatedContent(parsed);
			if (lang) content.language = lang;
			return content;
		}
		return null;
	}

	private parseRomanization(
		el: Element,
	): { text: string; language?: string } | null {
		const lang = this.getAttr(el, NS.XML, Attributes.Lang);
		const rawText = el.textContent || "";
		const text = rawText.trim().replace(TTMLParser.MULTI_SPACE_REGEX, " ");

		if (text) {
			return { text, language: lang || undefined };
		}
		return null;
	}

	private finalizeWords(words: Syllable[]): Syllable[] {
		if (words.length === 0) return [];

		const newWords = [...words];

		newWords[0] = { ...newWords[0], text: newWords[0].text.trimStart() };

		const lastIdx = newWords.length - 1;
		newWords[lastIdx] = {
			...newWords[lastIdx],
			text: newWords[lastIdx].text.trimEnd(),
			endsWithSpace: false,
		};

		return newWords;
	}

	private getAttr(
		element: Element,
		ns: string,
		localName: string,
	): string | null {
		const val = element.getAttributeNS(ns, localName);
		if (val) return val;

		if (element.hasAttributes()) {
			const attributes = Array.from(element.attributes);
			for (const attr of attributes) {
				const attrLocalName = attr.localName || attr.nodeName.split(":").pop();

				if (attrLocalName === localName) {
					return attr.value;
				}
			}
		}

		return null;
	}
}
