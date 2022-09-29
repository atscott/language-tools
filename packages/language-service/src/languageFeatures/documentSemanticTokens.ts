import * as shared from '@volar/shared';
import * as vscode from 'vscode-languageserver-protocol';
import { SemanticToken } from '@volar/language-service';
import type { LanguageServiceRuntimeContext } from '../types';
import { languageFeatureWorker } from '../utils/featureWorkers';

export function register(context: LanguageServiceRuntimeContext) {

	return (uri: string, range?: vscode.Range, cancleToken?: vscode.CancellationToken, reportProgress?: (tokens: SemanticToken[]) => void) => {

		const document = context.getTextDocument(uri);

		if (!document)
			return;

		const offsetRange: [number, number] = range ? [
			document.offsetAt(range.start),
			document.offsetAt(range.end),
		] : [
			0,
			document.getText().length,
		];

		return languageFeatureWorker(
			context,
			uri,
			offsetRange,
			function* (offsetRange, sourceMap) {

				if (cancleToken?.isCancellationRequested)
					return;

				let range: [number, number] | undefined;

				for (const mapping of sourceMap.mappings) {

					if (cancleToken?.isCancellationRequested)
						return;

					if (
						mapping.data.semanticTokens
						&& mapping.sourceRange[1] > offsetRange[0]
						&& mapping.sourceRange[0] < offsetRange[1]
					) {
						if (!range) {
							range = [...mapping.generatedRange];
						}
						else {
							range[0] = Math.min(range[0], mapping.generatedRange[0]);
							range[1] = Math.max(range[1], mapping.generatedRange[1]);
						}
					}
				}

				if (range) {
					yield range;
				}
			},
			(plugin, document, offsetRange) => plugin.findDocumentSemanticTokens?.(
				document,
				vscode.Range.create(document.positionAt(offsetRange[0]), document.positionAt(offsetRange[1])),
				cancleToken,
			),
			(tokens, sourceMap) => tokens.map<SemanticToken | undefined>(_token => {

				if (!sourceMap)
					return _token;

				const offset = sourceMap.mappedDocument.offsetAt({ line: _token[0], character: _token[1] });
				for (const mapped of sourceMap.toSourceOffsets(offset)) {
					if (mapped[1].data.semanticTokens) {
						const start = document.positionAt(mapped[0]);
						if (sourceMap.matchGeneratedPosition({ line: start.line, character: start.character + _token[2] }, mapped[1], 'end')) {
							return [start.line, start.character, _token[2], _token[3], _token[4]];
						}
					}
				}
			}).filter(shared.notEmpty),
			tokens => tokens.flat(),
			reportProgress, // TODO: this has no effect in LSP
		);
	};
}
