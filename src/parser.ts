import { Attributes, Elements, NS, Values } from "./constants";
import type {
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

export class TTMLParser {
	private domParser: DOMParser;

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

		while (i < amllWords.length && j < romanWords.length) {
			const main = amllWords[i];
			const sub = romanWords[j];

			if (Math.abs(main.startTime - sub.startTime) < 30) {
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
			platformIds: {},
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

		const agents = head.getElementsByTagNameNS(NS.TTM, Elements.Agent);

		for (let i = 0; i < agents.length; i++) {
			const agent = agents[i];
			const id = this.getAttr(agent, NS.XML, Attributes.Id);
			if (!id) continue;

			const names = agent.getElementsByTagNameNS(NS.TTM, Elements.Name);
			if (names.length > 0 && names[0].textContent) {
				meta.agents[id] = names[0].textContent.trim();
			}
		}
	}

	private parseAMLLMeta(head: Element, meta: TTMLMetadata) {
		const metas = head.getElementsByTagNameNS(NS.AMLL, Elements.Meta);

		for (let i = 0; i < metas.length; i++) {
			const el = metas[i];
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
		const iTunesMeta = head.getElementsByTagName(Elements.ITunesMetadata)[0];
		if (!iTunesMeta) return;

		const songwritersContainer = iTunesMeta.getElementsByTagName(
			Elements.Songwriters,
		)[0];
		if (songwritersContainer) {
			const writers = songwritersContainer.getElementsByTagName(
				Elements.Songwriter,
			);
			for (let i = 0; i < writers.length; i++) {
				const name = writers[i].textContent?.trim();
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

			const items = container.getElementsByTagName(itemTagName);
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				const lang = this.getAttr(item, NS.XML, Attributes.Lang);

				const textNodes = item.getElementsByTagName(Elements.Text);
				for (let j = 0; j < textNodes.length; j++) {
					const textNode = textNodes[j];
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

		processEntries(Elements.Translations, Elements.Translation, "translations");
		processEntries(
			Elements.Transliterations,
			Elements.Transliteration,
			"romanizations",
		);
	}

	private parseTime(timeStr: string | null): number {
		if (!timeStr) return 0;

		timeStr = timeStr.trim();

		if (timeStr.endsWith("s")) {
			const seconds = parseFloat(timeStr.slice(0, -1));
			return Math.round(seconds * 1000);
		}

		const parts = timeStr.split(":");
		let seconds = 0;

		if (parts.length === 3) {
			seconds += parseInt(parts[0], 10) * 3600;
			seconds += parseInt(parts[1], 10) * 60;
			seconds += parseFloat(parts[2]);
		} else if (parts.length === 2) {
			seconds += parseInt(parts[0], 10) * 60;
			seconds += parseFloat(parts[1]);
		} else if (parts.length === 1) {
			seconds += parseFloat(parts[0]);
		} else {
			console.warn(
				`TTMLParser: Unknown time format "${timeStr}", defaulting to 0.`,
			);
			return 0;
		}

		return Math.round(seconds * 1000);
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
			if (node.nodeType !== 1) continue;
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

		result.lines.sort((a, b) => a.startTime - b.startTime);
	}

	private mergeSidecar(
		target: LyricBase,
		source: TranslatedContent[],
		field: "translations" | "romanizations",
	) {
		if (!target[field]) {
			target[field] = [];
		}

		target[field]?.push(...source);

		if (target.backgroundVocals && target.backgroundVocals.length > 0) {
			source.forEach((srcItem) => {
				if (srcItem.backgroundVocals && srcItem.backgroundVocals.length > 0) {
					srcItem.backgroundVocals.forEach((srcBg, index) => {
						const targetBg = target.backgroundVocals?.[index];
						if (targetBg) {
							const bgContent: TranslatedContent = {
								language: srcItem.language,
								text: srcBg.text,
								words: srcBg.words,
								backgroundVocals: srcBg.backgroundVocals,
							};

							if (!targetBg[field]) {
								targetBg[field] = [];
							}

							targetBg[field]?.push(bgContent);
						}
					});
				}
			});
		}
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

		const line: LyricLine = {
			id: id,
			...baseContent,
		};

		if (songPart) line.songPart = songPart;

		const agentId = this.getAttr(p, NS.TTM, Elements.Agent);
		if (agentId) line.agentId = agentId;

		const externalData = sidecar[id];
		if (externalData) {
			if (externalData.translations) {
				this.mergeSidecar(line, externalData.translations, "translations");
			}
			if (externalData.romanizations) {
				this.mergeSidecar(line, externalData.romanizations, "romanizations");
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

		const result: LyricBase = {
			text: "",
			startTime: this.parseTime(beginStr),
			endTime: this.parseTime(endStr),
			words: undefined,
			translations: undefined,
			romanizations: undefined,
			backgroundVocals: undefined,
		};

		const childNodes = Array.from(element.childNodes);
		let fullText = "";
		const words: Syllable[] = [];

		for (const node of childNodes) {
			if (node.nodeType === 3) {
				const rawText = node.textContent || "";
				const isFormatting = rawText.includes("\n");

				if (isFormatting && rawText.trim().length === 0) {
					continue;
				}

				const normalizedText = rawText.replace(/\s+/g, " ");

				fullText += normalizedText;

				if (
					!isFormatting &&
					normalizedText.length > 0 &&
					normalizedText.trim().length === 0
				) {
					if (words.length > 0) {
						words[words.length - 1].endsWithSpace = true;
					}
				}
				continue;
			}

			if (node.nodeType !== 1) continue;
			const el = node as Element;
			const role = this.getAttr(el, NS.TTM, Attributes.Role);

			if (role === Values.RoleBg) {
				const bgVocal = this.parseCommonContent(el);

				const stripParens = (str: string) => {
					return str.replace(/^[(（]+/, "").replace(/[)）]+$/, "");
				};

				bgVocal.text = stripParens(bgVocal.text);

				if (bgVocal.words) {
					for (const word of bgVocal.words) {
						word.text = stripParens(word.text);
					}
				}

				if (!result.backgroundVocals) result.backgroundVocals = [];
				result.backgroundVocals.push(bgVocal);
			} else if (role === Values.RoleTranslation) {
				const lang = this.getAttr(el, NS.XML, Attributes.Lang);
				const text = el.textContent?.trim();

				if (text) {
					if (!result.translations) result.translations = [];
					result.translations.push({
						text,
						language: lang || undefined,
					});
				}
			} else if (role === Values.RoleRoman) {
				const lang = this.getAttr(el, NS.XML, Attributes.Lang);
				const text = el.textContent?.trim();

				if (text) {
					if (!result.romanizations) result.romanizations = [];
					result.romanizations.push({
						text,
						language: lang || undefined,
					});
				}
			} else {
				const wBegin =
					this.getAttr(el, NS.XML, Attributes.Begin) ||
					el.getAttribute(Attributes.Begin);
				const wEnd =
					this.getAttr(el, NS.XML, Attributes.End) ||
					el.getAttribute(Attributes.End);

				const rawWText = el.textContent || "";
				const normalizedWText = rawWText.replace(/\s+/g, " ");

				fullText += normalizedWText;

				if (wBegin && wEnd) {
					const isFormatting = rawWText.includes("\n");

					let startsWithSpace = false;
					let endsWithSpace = false;

					if (!isFormatting) {
						startsWithSpace = normalizedWText.startsWith(" ");
						endsWithSpace = normalizedWText.endsWith(" ");
					}

					const cleanText = normalizedWText.trim();

					if (startsWithSpace && words.length > 0) {
						words[words.length - 1].endsWithSpace = true;
					}

					if (cleanText.length > 0) {
						words.push({
							text: cleanText,
							startTime: this.parseTime(wBegin),
							endTime: this.parseTime(wEnd),
							endsWithSpace: endsWithSpace,
						});
					}
				}
			}
		}

		result.text = fullText.trim().replace(/\s+/g, " ");

		if (words.length > 0) {
			words[0].text = words[0].text.trimStart();
			const lastWord = words[words.length - 1];
			lastWord.text = lastWord.text.trimEnd();
			lastWord.endsWithSpace = false;

			result.words = words;
		}

		return result;
	}

	private getAttr(
		element: Element,
		ns: string,
		localName: string,
	): string | null {
		const val = element.getAttributeNS(ns, localName);
		if (val) return val;

		if (element.hasAttributes()) {
			for (let i = 0; i < element.attributes.length; i++) {
				const attr = element.attributes[i];
				const attrLocalName = attr.localName || attr.nodeName.split(":").pop();

				if (attrLocalName === localName) {
					return attr.value;
				}
			}
		}

		return null;
	}
}
