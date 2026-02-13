import {
	Attributes,
	Elements,
	NS,
	QualifiedAttributes,
	Values,
} from "./constants";
import type {
	AmllImportOptions,
	AmllLyricLine,
	AmllMetadata,
	GeneratorOptions,
	LyricBase,
	LyricLine,
	Syllable,
	TranslatedContent,
	TTMLMetadata,
	TTMLResult,
} from "./types";

export class TTMLGenerator {
	private doc: Document;
	private options: GeneratorOptions;
	private xmlSerializer: XMLSerializer;

	constructor(options: GeneratorOptions = {}) {
		this.options = options;

		let domImpl: DOMImplementation;
		if (this.options.domImplementation) {
			domImpl = this.options.domImplementation;
		} else if (typeof document !== "undefined" && document.implementation) {
			domImpl = document.implementation;
		} else {
			throw new Error(
				"No DOMImplementation found. If you are running in Node.js, please inject via options (e.g., using @xmldom/xmldom in Node.js).",
			);
		}

		if (this.options.xmlSerializer) {
			this.xmlSerializer = this.options.xmlSerializer;
		} else if (typeof XMLSerializer !== "undefined") {
			this.xmlSerializer = new XMLSerializer();
		} else {
			throw new Error(
				"No XMLSerializer found. If you are running in Node.js, please inject via options (e.g., using @xmldom/xmldom in Node.js).",
			);
		}

		this.doc = domImpl.createDocument(NS.TT, Elements.TT, null);
	}

	public generate(result: TTMLResult): string {
		const root = this.doc.documentElement;

		this.setupRootAttributes(root, result);

		const head = this.buildHead(result);
		root.appendChild(head);

		const body = this.buildBody(result);
		root.appendChild(body);

		const xmlStr = this.xmlSerializer.serializeToString(this.doc);

		return xmlStr;
	}

	public static toTTMLResult(
		amllLines: AmllLyricLine[],
		amllMetadata: AmllMetadata[],
		options: AmllImportOptions = {},
	): TTMLResult {
		const opts = {
			translationLanguage: "zh-Hans",
			romanizationLanguage: "ja-Latn",
			defaultAgentId: "v1",
			duetAgentId: "v2",
			...options,
		};

		const metadata: TTMLMetadata = {
			agents: {
				[opts.defaultAgentId]: { id: opts.defaultAgentId },
				[opts.duetAgentId]: { id: opts.duetAgentId },
			},
		};

		for (const entry of amllMetadata) {
			const { key, value } = entry;
			if (!value || value.length === 0) continue;

			switch (key) {
				case Values.MusicName:
					metadata.title = value;
					break;
				case Values.Artists:
					metadata.artist = value;
					break;
				case Values.Album:
					metadata.album = value;
					break;
				case Values.ISRC:
					metadata.isrc = value;
					break;
				case Values.TTMLAuthorGithub:
					metadata.authorIds = value;
					break;
				case Values.TTMLAuthorGithubLogin:
					metadata.authorNames = value;
					break;
				case Values.NCMMusicId:
				case Values.QQMusicId:
				case Values.SpotifyId:
				case Values.AppleMusicId:
					if (!metadata.platformIds) {
						metadata.platformIds = {};
					}

					metadata.platformIds[key] = value;
			}
		}

		const resultLines: LyricLine[] = [];
		let currentMainLine: LyricLine | null = null;
		let lineCounter = 1;

		for (const amllLine of amllLines) {
			const { mainSyllables, romanSyllables, fullText, romanText } =
				TTMLGenerator.convertWords(amllLine);

			const lyricBase: LyricBase = {
				startTime: amllLine.startTime,
				endTime: amllLine.endTime,
				text: fullText,
				words: mainSyllables,
			};

			if (amllLine.translatedLyric) {
				lyricBase.translations = [
					{
						language: opts.translationLanguage,
						text: amllLine.translatedLyric,
					},
				];
			}

			if (amllLine.romanLyric || romanSyllables.length > 0) {
				lyricBase.romanizations = [
					{
						language: opts.romanizationLanguage,
						text: amllLine.romanLyric || romanText,
						words: romanSyllables.length > 0 ? romanSyllables : undefined,
					},
				];
			}

			if (amllLine.isBG) {
				if (
					currentMainLine &&
					(!currentMainLine.backgroundVocals ||
						currentMainLine.backgroundVocals.length === 0)
				) {
					if (!currentMainLine.backgroundVocals) {
						currentMainLine.backgroundVocals = [];
					}
					currentMainLine.backgroundVocals.push(lyricBase);
				} else {
					const id = `L${lineCounter++}`;
					const inheritedAgentId = currentMainLine
						? currentMainLine.agentId
						: opts.defaultAgentId;

					const promotedLine: LyricLine = {
						id,
						agentId: inheritedAgentId,
						...lyricBase,
					};
					resultLines.push(promotedLine);
				}
			} else {
				const id = `L${lineCounter++}`;
				const agentId = amllLine.isDuet
					? opts.duetAgentId
					: opts.defaultAgentId;

				const lyricLine: LyricLine = {
					id,
					agentId,
					...lyricBase,
				};

				resultLines.push(lyricLine);
				currentMainLine = lyricLine;
			}
		}

		return {
			metadata: metadata,
			lines: resultLines,
		};
	}

	private static convertWords(amllLine: AmllLyricLine) {
		const mainSyllables: Syllable[] = [];
		const romanSyllables: Syllable[] = [];

		for (const word of amllLine.words) {
			const rawText = word.word;
			const trimmedText = rawText.trimEnd();
			const hasSpace = rawText !== trimmedText;

			mainSyllables.push({
				text: trimmedText,
				startTime: word.startTime,
				endTime: word.endTime,
				endsWithSpace: hasSpace,
			});

			if (word.romanWord) {
				romanSyllables.push({
					text: word.romanWord.trim(), // AMLL 那边的实现已经总是 trim 各个逐字音译音节了
					startTime: word.startTime,
					endTime: word.endTime,
				});
			}
		}

		const fullText = amllLine.words.map((w) => w.word).join("");

		const romanText =
			romanSyllables.length > 0
				? romanSyllables
						.map((s) => s.text + (s.endsWithSpace ? " " : ""))
						.join("")
				: "";

		return { mainSyllables, romanSyllables, fullText, romanText };
	}

	private setupRootAttributes(root: Element, result: TTMLResult) {
		root.setAttributeNS(NS.XMLNS, QualifiedAttributes.XmlnsTtm, NS.TTM);
		root.setAttributeNS(NS.XMLNS, QualifiedAttributes.XmlnsItunes, NS.ITUNES);
		root.setAttributeNS(NS.XMLNS, QualifiedAttributes.XmlnsAmll, NS.AMLL);

		if (result.metadata.language) {
			root.setAttributeNS(
				NS.XML,
				QualifiedAttributes.XmlLang,
				result.metadata.language,
			);
		}

		if (result.metadata.timingMode) {
			root.setAttributeNS(
				NS.ITUNES,
				QualifiedAttributes.ITunesTiming,
				result.metadata.timingMode,
			);
		}
	}

	private isLyricBase(
		content: LyricBase | TranslatedContent,
	): content is LyricBase {
		return "startTime" in content;
	}

	private shouldMoveToSidecar(content: TranslatedContent): boolean {
		const isWordByWord = content.words && content.words.length > 0;
		if (isWordByWord) return true;
		return !!this.options.useSidecar;
	}

	private buildHead(result: TTMLResult): Element {
		const head = this.doc.createElement(Elements.Head);
		const metadata = this.doc.createElement(Elements.TTMLMetadata);

		const meta = result.metadata;

		Object.values(meta.agents).forEach((agent) => {
			const { id, name } = agent;
			const agentEl = this.doc.createElementNS(
				NS.TTM,
				QualifiedAttributes.TTMAgent,
			);
			const type = id === Values.AgentGroup ? Values.Group : Values.Person;

			agentEl.setAttribute(Attributes.Type, type);
			agentEl.setAttribute(QualifiedAttributes.XmlId, id);

			if (name) {
				const nameEl = this.doc.createElementNS(
					NS.TTM,
					QualifiedAttributes.TTMName,
				);
				nameEl.setAttribute(Attributes.Type, Values.Full);
				nameEl.textContent = name;
				agentEl.appendChild(nameEl);
			}

			metadata.appendChild(agentEl);
		});

		const addAmllMeta = (key: string, value: string) => {
			const el = this.doc.createElementNS(
				NS.AMLL,
				QualifiedAttributes.AmllMeta,
			);
			el.setAttribute(Attributes.Key, key);
			el.setAttribute(Attributes.Value, value);
			metadata.appendChild(el);
		};

		meta.title?.forEach((v) => {
			addAmllMeta(Values.MusicName, v);
		});
		meta.artist?.forEach((v) => {
			addAmllMeta(Values.Artists, v);
		});
		meta.album?.forEach((v) => {
			addAmllMeta(Values.Album, v);
		});
		meta.authorIds?.forEach((v) => {
			addAmllMeta(Values.TTMLAuthorGithub, v);
		});
		meta.authorNames?.forEach((v) => {
			addAmllMeta(Values.TTMLAuthorGithubLogin, v);
		});
		meta.isrc?.forEach((v) => {
			addAmllMeta(Values.ISRC, v);
		});

		if (result.metadata.platformIds) {
			Object.entries(result.metadata.platformIds).forEach(([key, values]) => {
				values?.forEach((v) => {
					addAmllMeta(key, v);
				});
			});
		}

		this.buildITunesMetadata(metadata, result);

		head.appendChild(metadata);
		return head;
	}

	private buildITunesMetadata(metadataEl: Element, result: TTMLResult) {
		const iTunesMeta = this.doc.createElement(Elements.ITunesMetadata);
		iTunesMeta.setAttribute(Attributes.Xmlns, NS.ITUNES_INTERNAL);

		let hasContent = false;

		if (result.metadata.songwriters && result.metadata.songwriters.length > 0) {
			const container = this.doc.createElement(Elements.Songwriters);
			result.metadata.songwriters.forEach((name) => {
				const sw = this.doc.createElement(Elements.Songwriter);
				sw.textContent = name;
				container.appendChild(sw);
			});
			iTunesMeta.appendChild(container);
			hasContent = true;
		}

		const translationsMap = new Map<
			string | undefined,
			Array<{ id: string; content: TranslatedContent }>
		>();
		const romansMap = new Map<
			string | undefined,
			Array<{ id: string; content: TranslatedContent }>
		>();

		for (const line of result.lines) {
			if (line.translations) {
				line.translations.forEach((content) => {
					if (this.shouldMoveToSidecar(content)) {
						const lang = content.language;
						if (!translationsMap.has(lang)) translationsMap.set(lang, []);
						translationsMap.get(lang)?.push({ id: line.id, content });
					}
				});
			}
			if (line.romanizations) {
				line.romanizations.forEach((content) => {
					if (this.shouldMoveToSidecar(content)) {
						const lang = content.language;
						if (!romansMap.has(lang)) romansMap.set(lang, []);
						romansMap.get(lang)?.push({ id: line.id, content });
					}
				});
			}
		}

		if (translationsMap.size > 0) {
			const container = this.doc.createElement(Elements.Translations);
			for (const [lang, items] of translationsMap) {
				const transEl = this.doc.createElement(Elements.Translation);
				if (lang) {
					transEl.setAttribute(QualifiedAttributes.XmlLang, lang);
				}
				items.forEach((item) => {
					const textEl = this.doc.createElement(Elements.Text);
					textEl.setAttribute(Attributes.For, item.id);
					this.appendContentToElement(textEl, item.content);
					transEl.appendChild(textEl);
				});
				container.appendChild(transEl);
			}
			iTunesMeta.appendChild(container);
			hasContent = true;
		}

		if (romansMap.size > 0) {
			const container = this.doc.createElement(Elements.Transliterations);
			for (const [lang, items] of romansMap) {
				const transEl = this.doc.createElement(Elements.Transliteration);
				if (lang) {
					transEl.setAttribute(QualifiedAttributes.XmlLang, lang);
				}
				items.forEach((item) => {
					const textEl = this.doc.createElement(Elements.Text);
					textEl.setAttribute(Attributes.For, item.id);
					this.appendContentToElement(textEl, item.content);
					transEl.appendChild(textEl);
				});
				container.appendChild(transEl);
			}
			iTunesMeta.appendChild(container);
			hasContent = true;
		}

		if (hasContent) {
			metadataEl.appendChild(iTunesMeta);
		}
	}

	private buildBody(result: TTMLResult): Element {
		const body = this.doc.createElement(Elements.Body);
		const sortedLines = [...result.lines].sort(
			(a, b) => a.startTime - b.startTime,
		);

		const lastTime =
			sortedLines.length > 0 ? sortedLines[sortedLines.length - 1].endTime : 0;
		body.setAttribute(Attributes.Dur, this.formatTime(lastTime));

		let currentDiv: Element | null = null;
		let currentSongPart: string | undefined;
		let currentSectionEndTime = 0;

		const finalizeCurrentDiv = () => {
			if (currentDiv && currentSectionEndTime > 0) {
				currentDiv.setAttribute(
					Attributes.End,
					this.formatTime(currentSectionEndTime),
				);
				if (currentSongPart) {
					currentDiv.setAttributeNS(
						NS.ITUNES,
						QualifiedAttributes.ITunesPart,
						currentSongPart,
					);
				}
			}
		};

		for (const line of sortedLines) {
			if (line.songPart !== currentSongPart || !currentDiv) {
				finalizeCurrentDiv();

				currentSongPart = line.songPart;
				currentSectionEndTime = 0;

				currentDiv = this.doc.createElement(Elements.Div);

				currentDiv.setAttribute(
					Attributes.Begin,
					this.formatTime(line.startTime),
				);

				body.appendChild(currentDiv);
			}

			if (line.endTime > currentSectionEndTime) {
				currentSectionEndTime = line.endTime;
			}

			const p = this.doc.createElement(Elements.P);
			p.setAttribute(Attributes.Begin, this.formatTime(line.startTime));
			p.setAttribute(Attributes.End, this.formatTime(line.endTime));
			p.setAttributeNS(NS.ITUNES, QualifiedAttributes.ITunesKey, line.id);
			if (line.agentId) {
				p.setAttributeNS(NS.TTM, QualifiedAttributes.TTMAgent, line.agentId);
			}

			this.appendContentToElement(p, line);
			currentDiv.appendChild(p);
		}

		finalizeCurrentDiv();

		return body;
	}

	private appendContentToElement(
		element: Element,
		content: LyricBase | TranslatedContent,
	) {
		if (content.words && content.words.length > 0) {
			content.words.forEach((syllable) => {
				const span = this.doc.createElement(Elements.Span);
				span.setAttribute(
					Attributes.Begin,
					this.formatTime(syllable.startTime),
				);
				span.setAttribute(Attributes.End, this.formatTime(syllable.endTime));

				span.textContent = syllable.text;
				element.appendChild(span);

				if (syllable.endsWithSpace) {
					const spaceNode = this.doc.createTextNode(" ");
					element.appendChild(spaceNode);
				}
			});
		} else {
			element.textContent = content.text;
		}

		if (this.isLyricBase(content)) {
			if (content.translations) {
				content.translations.forEach((trans) => {
					if (!this.shouldMoveToSidecar(trans)) {
						const span = this.doc.createElement(Elements.Span);
						span.setAttributeNS(
							NS.TTM,
							QualifiedAttributes.TTMRole,
							Values.RoleTranslation,
						);
						if (trans.language) {
							span.setAttributeNS(
								NS.XML,
								QualifiedAttributes.XmlLang,
								trans.language,
							);
						}
						this.appendContentToElement(span, trans);
						element.appendChild(span);
					}
				});
			}

			if (content.romanizations) {
				content.romanizations.forEach((roman) => {
					if (!this.shouldMoveToSidecar(roman)) {
						const span = this.doc.createElement(Elements.Span);
						span.setAttributeNS(
							NS.TTM,
							QualifiedAttributes.TTMRole,
							Values.RoleRoman,
						);
						if (roman.language) {
							span.setAttributeNS(
								NS.XML,
								QualifiedAttributes.XmlLang,
								roman.language,
							);
						}
						this.appendContentToElement(span, roman);
						element.appendChild(span);
					}
				});
			}
		}

		if (content.backgroundVocals && content.backgroundVocals.length > 0) {
			content.backgroundVocals.forEach((bg) => {
				const bgSpan = this.doc.createElement(Elements.Span);
				bgSpan.setAttributeNS(
					NS.TTM,
					QualifiedAttributes.TTMRole,
					Values.RoleBg,
				);

				if (this.isLyricBase(bg)) {
					if (bg.startTime > 0 && bg.endTime > 0) {
						bgSpan.setAttribute(
							Attributes.Begin,
							this.formatTime(bg.startTime),
						);
						bgSpan.setAttribute(Attributes.End, this.formatTime(bg.endTime));
					}
				}

				this.appendContentToElement(bgSpan, bg);
				element.appendChild(bgSpan);
			});
		}
	}

	private formatTime(ms: number): string {
		if (ms < 0) ms = 0;

		const totalSeconds = Math.floor(ms / 1000);
		const milliseconds = ms % 1000;
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;

		const mm = minutes.toString().padStart(2, "0");
		const ss = seconds.toString().padStart(2, "0");
		const fff = milliseconds.toString().padStart(3, "0");

		return `${mm}:${ss}.${fff}`;
	}
}
