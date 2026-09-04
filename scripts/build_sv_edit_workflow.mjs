/* Emits the n8n Workflow SDK source used by the edit webhook. */
const js = (source) => JSON.stringify(source);

const validateJs = String.raw`const crypto = require('crypto');
const incoming = $input.first() ?? {};
const input = incoming.json ?? {};
const binary = incoming.binary ?? {};
const categories = new Set('Hogar|Muebles|Electrodomésticos|Infantil|Ropa|Libros|Música y cine|Tecnología|Móviles y telefonía|Informática|Deportes y ocio|Bicicletas|Juegos y videojuegos|Manualidades y coleccionismo|Jardín y bricolaje|Otros'.split('|'));
const conditions = new Set(['Como nuevo', 'Bueno', 'Aceptable', 'Roto']);
const zones = new Set('Arcas Reales|Arturo Eyries|Barrio España|Batallas|Belén - Pilarica|Campo Grande|Caño Argales|Circular|Ciudad de la Comunicación|Coto de Simancas|Covaresa|Cuatro de Marzo|Delicias - Arco de Ladrillo|Delicias - Canterac|El Berrocal|El Peral|El Pinar|Girón|Hospital|Huerta del Rey|La Antigua - Santa Cruz|La Farola|La Overuela|La Rubia|La Victoria|Las Flores|Las Villas - Valparaíso|Pajarillos Altos|Pajarillos Bajos|Parque Alameda - Paula López|Parquesol|Pilarica - Los Santos|Pinar de Jalón|Plaza de Toros|Plaza España|Plaza Mayor|Polígono Argales|Polígono Industrial la Mora|Polígono San Cristóbal|Puente Duero|Puente Jardín|Rondilla|San Isidro|San Pablo - San Nicolás|San Pedro Regalado|Soto de Medinilla|Urbanización El Pichón|Urbanización El Plantío|Urbanización Entrepinos|Urbanización Las Aceñas|Vadillos|Villa del Prado|Aldeamayor de San Martín|Arroyo de la Encomienda|Boecillo|Cabezón de Pisuerga|Cigales|Ciguñuela|Cistérniga|Covaresa|Corcos|Cubillas de Santa Marta|Fuensaldaña|Geria|Laguna de Duero|La Pedraja de Portillo|Mucientes|Olmos de Esgueva|Piña de Esgueva|Quintanilla de Trigueros|Renedo de Esgueva|Robladillo|San Martín de Valvení|Santovenia de Pisuerga|Simancas|Trigueros del Valle|Tudela de Duero|Valdestillas|Valoria la Buena|Viana de Cega|Villabáñez|Villanubla|Villanueva de Duero|Villanueva de los Infantes|Villarmentero de Esgueva|Villavaquerín|Wamba|Zaratán|Aguilarejo|Granja Muedra|Herrera de Duero|La Flecha|San Andrés'.split('|'));
function output(json) { return [{ json, binary }]; }
function invalid(error) { return output({ ok: false, valid: false, error_code: error, error }); }
let body = input.body ?? input;
if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return invalid('invalid_json'); } }
const payload = body?.payload ?? input.payload;
if (typeof payload === 'string') { try { body = JSON.parse(payload); } catch { return invalid('invalid_payload'); } }
else if (payload && typeof payload === 'object') body = payload;
const initData = typeof body.initData === 'string' ? body.initData.trim() : '';
if (!initData) return invalid('telegram_init_data_missing');
const item = body.item && typeof body.item === 'object' ? body.item : {};
const itemId = String(body.item_id ?? '').trim();
const title = typeof item.title === 'string' ? item.title.trim() : '';
const description = typeof item.description === 'string' ? item.description.trim() : '';
const category = typeof item.category === 'string' ? item.category.trim() : '';
const zone = typeof item.zone === 'string' ? item.zone.trim() : '';
const condition = typeof item.condition === 'string' ? item.condition.trim() : '';
const keepPhotoKeys = Array.isArray(body.keep_photo_keys) ? body.keep_photo_keys.map((key) => String(key).trim()).filter(Boolean) : [];
const photoEntries = Object.entries(binary).filter(([name, file]) => /^photo_[01]$/.test(name) && file?.data);
const size = (file) => Number(file.fileSize ?? file.size ?? (typeof file.data === 'string' ? Math.floor(file.data.length * 3 / 4) : NaN));
if (!itemId) return invalid('item_id_missing');
if (title.length < 3 || title.length > 80) return invalid('title_invalid');
if (!categories.has(category)) return invalid('category_invalid');
if (!zones.has(zone)) return invalid('zone_invalid');
if (!conditions.has(condition)) return invalid('condition_invalid');
if (description.length > 600) return invalid('description_too_long');
const textValue = (title + ' ' + description).toLowerCase();
const hasBareDomain = textValue.split(" ").some((token) => { const dot = token.indexOf("."); return dot > 0 && token.length - dot > 2 && !token.startsWith("."); });
if (textValue.includes("http://") || textValue.includes("https://") || textValue.includes("www.") || hasBareDomain) return invalid('url_not_allowed');
if (photoEntries.length > 2) return invalid('too_many_photos');
for (const [, file] of photoEntries) { const mime = file.mimeType ?? file.mimetype ?? ''; if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return invalid('photo_type_invalid'); if (!Number.isFinite(size(file)) || size(file) <= 0 || size(file) > 20 * 1024 * 1024) return invalid('photo_too_large'); }
return output({ ok: true, valid: true, mode: 'edit', initData, item_id: itemId, title, description, category, zone, condition, expected_updated_at: String(body.expected_updated_at ?? '').trim(), keep_photo_keys: keepPhotoKeys, new_photo_count: photoEntries.length });`;

const authJs = String.raw`const source = $('Validate edit payload').first() ?? {};
const response = $input.first()?.json ?? {};
if (response.valid !== true) return [{ json: { ok: false, valid: false, error_code: response.error_code ?? 'telegram_identity_invalid', error: response.error ?? 'No se ha podido validar Telegram.' }, binary: source.binary ?? {} }];
return [{ json: { ...source.json, owner_telegram_id: String(response.telegram_id ?? response.user?.id ?? ''), is_admin: response.is_admin === true }, binary: source.binary ?? {} }];`;

const verifyJs = String.raw`const request = $('Attach validated identity').first()?.json ?? {};
const source = $('Attach validated identity').first() ?? {};
const rows = $input.all();
function output(json) { return [{ json, binary: source.binary ?? {} }]; }
function invalid(error) { return output({ ok: false, valid: false, error_code: error, error: error === 'edit_conflict' ? 'La publicación ha cambiado. Recarga la ficha antes de volver a editarla.' : error }); }
function list(value) { if (Array.isArray(value)) return value; if (value && typeof value === 'object') return [value]; if (typeof value !== 'string' || !value.trim()) return []; try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed] : []; } catch { return []; } }
function key(value, index) { const item = typeof value === 'string' ? value : value ?? {}; return String(item.path ?? item.signedPath ?? item.url ?? item.signedUrl ?? item.title ?? 'index:' + index).trim(); }
function url(value) { const item = typeof value === 'string' ? value : value ?? {}; const raw = String(item.url ?? item.signedUrl ?? item.path ?? item.signedPath ?? item.thumbnails?.small?.signedPath ?? '').trim(); if (raw.startsWith('http://') || raw.startsWith('https://')) return raw; if (raw.startsWith('/')) return 'https://proyectos.aldeapucela.org' + raw; if (raw.startsWith('download/') || raw.startsWith('dltemp/')) return 'https://proyectos.aldeapucela.org/' + raw; return ''; }
const entry = rows.find((row) => { const fields = row.json?.fields ?? row.json ?? {}; return String(fields.public_id ?? fields['item-id'] ?? '') === String(request.item_id); });
if (!entry) return invalid('not_found');
const fields = entry.json?.fields ?? entry.json ?? {};
const status = String(fields.status ?? '').toLowerCase();
const isAdmin = request.is_admin === true;
if (!isAdmin && String(fields.owner_telegram_id ?? '') !== String(request.owner_telegram_id)) return invalid('not_owner');
if (!['available', 'reserved', 'completed', 'expired'].includes(status) || (!isAdmin && status !== 'available')) return invalid('edit_not_available');
const expires = fields.expires_at ? Date.parse(String(fields.expires_at).replace(' ', 'T')) : NaN;
if (!isAdmin && Number.isFinite(expires) && expires < Date.now()) return invalid('edit_expired');
const updatedAt = String(fields.updated_at ?? fields['Last modified time'] ?? fields.UpdatedAt ?? '').trim();
if (request.expected_updated_at && updatedAt && request.expected_updated_at !== updatedAt) return invalid('edit_conflict');
const attachments = list(fields.photos ?? fields.Fotos ?? fields.fotos);
const indexed = attachments.map((photo, index) => ({ photo, index, key: key(photo, index), url: url(photo) }));
const keep = new Set(request.keep_photo_keys);
const kept = indexed.filter((photo) => keep.has(photo.key) || keep.has('index:' + photo.index));
const finalCount = kept.length + Number(request.new_photo_count ?? 0);
if (finalCount < 1) return invalid('photo_required');
if (finalCount > 2) return invalid('too_many_photos');
const rowId = entry.json?.id ?? entry.json?.Id ?? fields.id ?? fields.Id ?? '';
const currentValues = {
  title: String(fields.title ?? '').trim(),
  description: String(fields.description ?? '').trim(),
  category: String(fields.category ?? '').trim(),
  zone: String(fields.zone ?? '').trim(),
  condition: String(fields.condition ?? '').trim(),
};
const changedFields = Object.keys(currentValues).filter((field) => request[field] !== currentValues[field]);
const textModerationRequired = changedFields.includes('title') || changedFields.includes('description');
const photoModerationRequired = Number(request.new_photo_count ?? 0) > 0;
const moderationText = [
  changedFields.includes('title') ? 'Título editado: ' + request.title : '',
  changedFields.includes('description') ? 'Descripción editada: ' + request.description : '',
].filter(Boolean).join('\\n');
return output({ ...request, ok: true, valid: true, row_id: rowId, current_status: status, changed_fields: changedFields, text_moderation_required: textModerationRequired, photo_moderation_required: photoModerationRequired, moderation_required: textModerationRequired || photoModerationRequired, moderation_text: moderationText, keep_photo_attachments: kept.map((entry) => entry.photo), current_photo_urls: kept.map((entry) => entry.url).filter(Boolean), current_photo_keys: kept.map((entry) => entry.key), final_photo_count: finalCount });`;

const explodeModerationJs = String.raw`const source = $('Verify owner and version').first() ?? {};
const binary = source.binary ?? {};
return Object.keys(binary).filter((name) => /^photo_[01]$/.test(name) && binary[name]).sort().map((name, index) => ({ json: { ...source.json, moderation_photo_index: index }, binary: { data: binary[name] } }));`;
const evaluateJs = String.raw`const results = $input.all().map((item) => { let value = item.json?.output ?? item.json?.response ?? item.json?.text ?? item.json; if (typeof value === 'string') { try { value = JSON.parse(value.replace(/^\x60\x60\x60json\s*|\x60\x60\x60$/g, '').trim()); } catch { value = null; } } return value && typeof value === 'object' ? value : null; });
const base = $('Verify owner and version').first() ?? {};
function output(json) { return [{ json, binary: base.binary ?? {} }]; }
if (results.some((value) => !value)) return output({ ok: false, valid: false, error_code: 'photo_moderation_unavailable', error: 'No se ha podido comprobar el contenido. Inténtalo de nuevo en unos segundos.' });
const blocked = results.find((value) => value.not_allowed === true);
if (blocked) return output({ ok: false, valid: false, error_code: 'publication_not_allowed', error: 'No se puede guardar esta publicación porque no está permitida en SegundaVida.' + (blocked.category && blocked.category !== 'ninguna' ? ' Motivo: ' + blocked.category + '.' : '') });
if (results.some((value) => value.safe !== true || value.offensive === true || value.spam === true)) return output({ ok: false, valid: false, error_code: 'photo_moderation_rejected', error: 'La imagen, el título o la descripción pueden contener contenido ofensivo o spam.' });
return output({ ...base.json, moderation_ok: true });`;
const explodeUploadJs = String.raw`const source = $('Verify owner and version').first() ?? {};
const binary = source.binary ?? {};
return Object.keys(binary).filter((name) => /^photo_[01]$/.test(name) && binary[name]).sort().map((name, index) => { const file = binary[name]; return { json: { ...source.json, photo_filename: file.fileName ?? ('photo_' + index + '.jpg'), photo_mime_type: file.mimeType ?? file.mimetype ?? 'image/jpeg' }, binary: { data: file } }; });`;
const prepareUploadJs = String.raw`const input = $input.first() ?? {};
const file = input.binary?.data;
if (!file?.data) throw new Error('No se encontró la imagen normalizada.');
const buffer = await this.helpers.getBinaryDataBuffer(0, 'data');
const baseName = String(input.json?.photo_filename ?? file.fileName ?? 'photo.jpg').replace(/\.[^.]+$/, '') || 'photo';
return [{ json: { ...(input.json ?? {}), photo_base64: buffer.toString('base64'), photo_filename: baseName + '.jpg', photo_mime_type: 'image/jpeg' } }];`;
const responseJs = String.raw`const base = $('Verify owner and version').first()?.json ?? {};
const urls = Array.isArray(base.current_photo_urls) ? base.current_photo_urls : [];
return [{ json: { ok: true, item_id: base.item_id, public_id: base.item_id, title: base.title, description: base.description, category: base.category, zone: base.zone, condition: base.condition, status: base.current_status ?? 'available', updated_at: new Date().toISOString(), image_url: urls[0] ?? null, image_urls: urls, photo_keys: base.current_photo_keys, message: 'Publicación actualizada' } }];`;

const systemPrompt = 'Eres el moderador de contenido de SegundaVida. Es una web vecinal para regalar objetos físicos legales, seguros, de propiedad de quien publica y completamente gratis. Marca not_allowed=true para medicamentos sujetos a prescripción, armas, explosivos, drogas, animales, documentos o datos personales, dinero, servicios, publicidad, ventas, trueques, objetos ilegales, peligrosos o engañosos. Marca offensive=true para desnudez sexual explícita, violencia gráfica, odio o amenazas. Marca spam=true para spam, enlaces o direcciones web. No bloquees objetos domésticos, ropa, muebles, tecnología, libros, herramientas, juguetes o bicicletas sin una señal clara. safe solo es true cuando las tres banderas son false. Devuelve únicamente el JSON solicitado.';
const schema = JSON.stringify({ type: 'object', properties: { safe: { type: 'boolean' }, offensive: { type: 'boolean' }, spam: { type: 'boolean' }, not_allowed: { type: 'boolean' }, category: { type: 'string' }, reason: { type: 'string' } }, required: ['safe', 'offensive', 'spam', 'not_allowed', 'category', 'reason'] });
function model(name) { return languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter', version: 1, config: { name, credentials: { openRouterApi: newCredential('OpenRouter account') }, parameters: { model: 'google/gemma-4-26b-a4b-it', options: { maxTokens: 120, responseFormat: 'json_object', temperature: 0, timeout: 30000, maxRetries: 1 } } } }); }
function parser(name) { return outputParser({ type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3, config: { name, parameters: { schemaType: 'manual', inputSchema: schema } } }); }
function chain(name, position, text, messages, modelNode, parserNode) { return node({ type: '@n8n/n8n-nodes-langchain.chainLlm', version: 1.9, config: { name, position, parameters: { promptType: 'define', text: expr(text), hasOutputParser: true, messages: { messageValues: messages }, batching: { batchSize: 2, delayBetweenBatches: 0 } }, subnodes: { model: modelNode, outputParser: parserNode } } }); }

const skipModerationJs = [
  "const source = $('Verify owner and version').first() ?? {};",
  "return [{ json: { ...(source.json ?? {}), moderation_ok: true, moderation_skipped: true }, binary: source.binary ?? {} }];",
].join('\\n');

const code = `import { workflow, node, trigger, languageModel, outputParser, newCredential, ifElse, expr } from '@n8n/workflow-sdk';
const systemPrompt = ${js(systemPrompt)};
const schema = ${js(schema)};
const noco = { authentication: 'nocoDbApiToken', workspaceId: { __rl: true, mode: 'list', value: 'wfrogvq8', cachedResultName: 'Default Workspace' }, projectId: { __rl: true, mode: 'list', value: 'p3amiucxfm0jzoc', cachedResultName: 'Aldea Pucela' }, table: { __rl: true, mode: 'list', value: 'mwk20n0679wz5fr', cachedResultName: 'Segunda Vida' } };
const uploadField = { __rl: true, mode: 'list', value: 'ch5e05viwhejny9', cachedResultName: 'photos' };
const webhook = trigger({ type: 'n8n-nodes-base.webhook', version: 2.1, config: { name: 'Edit Webhook', position: [-1120, 0], parameters: { httpMethod: 'POST', path: 'segundavida/edit', responseMode: 'responseNode', options: { binaryData: true, binaryPropertyName: 'data', allowedOrigins: 'https://segundavida.aldeapucela.org,http://localhost:8000,http://127.0.0.1:8000' } } } });
const validate = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Validate edit payload', position: [-896, 0], parameters: { mode: 'runOnceForAllItems', jsCode: ${js(validateJs)} } } });
const whoami = node({ type: 'n8n-nodes-base.httpRequest', version: 4.5, config: { name: 'Validate Telegram identity', position: [-672, 0], parameters: { method: 'POST', url: 'https://tasks.nukeador.com/webhook/segundavida/whoami', sendHeaders: true, specifyHeaders: 'keypair', headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Accept', value: 'application/json' }] }, sendBody: true, contentType: 'json', specifyBody: 'json', jsonBody: expr('={{ JSON.stringify({ initData: $json.initData }) }}'), options: {}, response: { response: { responseFormat: 'json' } } } } });
const auth = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Attach validated identity', position: [-448, 0], parameters: { mode: 'runOnceForAllItems', jsCode: ${js(authJs)} } } });
const search = node({ type: 'n8n-nodes-base.nocoDb', version: 4, config: { name: 'Search item and attachments', position: [-224, 0], credentials: { nocoDbApiToken: newCredential('NocoDB Token account') }, parameters: { resource: 'row', operation: 'search', ...noco, returnAll: true, downloadAttachments: true, downloadFieldNames: ['ch5e05viwhejny9'], options: {} } } });
const verify = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Verify owner and version', position: [0, 0], parameters: { mode: 'runOnceForAllItems', jsCode: ${js(verifyJs)} } } });
const verificationPassed = ifElse({ version: 2.2, config: { name: 'Edit verification passed?', position: [224, -240], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('={{ $json.ok === true && $json.valid === true }}'), rightValue: true, operator: { type: 'boolean', operation: 'equals' } }], combinator: 'and' } } } });
const hasPhotos = ifElse({ version: 2.2, config: { name: 'Has replacement photos?', position: [224, 0], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('={{ $json.new_photo_count > 0 }}'), rightValue: true, operator: { type: 'boolean', operation: 'equals' } }], combinator: 'and' } } } });
const hasEditedText = ifElse({ version: 2.2, config: { name: 'Has edited text?', position: [448, 320], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('={{ $json.text_moderation_required === true }}'), rightValue: true, operator: { type: 'boolean', operation: 'equals' } }], combinator: 'and' } } } });
const textModel = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter', version: 1, config: { name: 'OpenRouter moderation model (edit text)', credentials: { openRouterApi: newCredential('OpenRouter account') }, parameters: { model: 'google/gemma-4-26b-a4b-it', options: { maxTokens: 120, responseFormat: 'json_object', temperature: 0, timeout: 30000, maxRetries: 1 } } } });
const textParser = outputParser({ type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3, config: { name: 'Moderation output parser (edit text)', parameters: { schemaType: 'manual', inputSchema: schema } } });
const textChain = node({ type: '@n8n/n8n-nodes-langchain.chainLlm', version: 1.9, config: { name: 'Moderate edited text', position: [672, 320], parameters: { promptType: 'define', text: expr("={{ $json.moderation_text || '' }}"), hasOutputParser: true, messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: systemPrompt }] }, batching: { batchSize: 2, delayBetweenBatches: 0 } }, subnodes: { model: textModel, outputParser: textParser } } });
const photoModel = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatOpenRouter', version: 1, config: { name: 'OpenRouter moderation model (edit photo)', credentials: { openRouterApi: newCredential('OpenRouter account') }, parameters: { model: 'google/gemma-4-26b-a4b-it', options: { maxTokens: 120, responseFormat: 'json_object', temperature: 0, timeout: 30000, maxRetries: 1 } } } });
const photoParser = outputParser({ type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3, config: { name: 'Moderation output parser (edit photo)', parameters: { schemaType: 'manual', inputSchema: schema } } });
const explodeModeration = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Prepare new photos for moderation', position: [448, 160], parameters: { mode: 'runOnceForAllItems', jsCode: ${js(explodeModerationJs)} } } });
const photoChain = node({ type: '@n8n/n8n-nodes-langchain.chainLlm', version: 1.9, config: { name: 'Moderate edited text and photos', position: [672, 160], parameters: { promptType: 'define', text: expr("={{ ($json.moderation_text || '') + '\\nAnaliza únicamente la imagen nueva adjunta.' }}"), hasOutputParser: true, messages: { messageValues: [{ type: 'SystemMessagePromptTemplate', message: systemPrompt }, { type: 'HumanMessagePromptTemplate', messageType: 'imageBinary', binaryImageDataKey: 'data', imageDetail: 'low' }] }, batching: { batchSize: 2, delayBetweenBatches: 0 } }, subnodes: { model: photoModel, outputParser: photoParser } } });
const evaluate = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Evaluate edit moderation', position: [896, 0], parameters: { mode: 'runOnceForAllItems', jsCode: ${js(evaluateJs)} } } });
const approved = ifElse({ version: 2.2, config: { name: 'Edit moderation approved?', position: [1120, 0], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('={{ $json.moderation_ok }}'), rightValue: true, operator: { type: 'boolean', operation: 'equals' } }], combinator: 'and' } } } });
const hasUploads = ifElse({ version: 2.2, config: { name: 'Has photos to upload?', position: [1344, 0], parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 }, conditions: [{ leftValue: expr('={{ $json.new_photo_count > 0 }}'), rightValue: true, operator: { type: 'boolean', operation: 'equals' } }], combinator: 'and' } } } });
const updateFields = { resource: 'row', operation: 'update', ...noco, dataToSend: 'mapWithFields', id: expr('={{ $json.row_id }}'), fieldsMapper: { mappingMode: 'defineBelow', value: { title: expr('={{ $json.title }}'), description: expr('={{ $json.description }}'), category: expr('={{ $json.category }}'), zone: expr('={{ $json.zone }}'), condition: expr('={{ $json.condition }}'), updated_at: expr('={{ $now.toISO() }}'), photos: expr('={{ JSON.stringify($json.keep_photo_attachments) }}') }, matchingColumns: [], schema: [{ id: 'title', displayName: 'title', type: 'string' }, { id: 'description', displayName: 'description', type: 'string' }, { id: 'category', displayName: 'category', type: 'string' }, { id: 'zone', displayName: 'zone', type: 'string' }, { id: 'condition', displayName: 'condition', type: 'string' }, { id: 'updated_at', displayName: 'updated_at', type: 'dateTime' }, { id: 'photos', displayName: 'photos', type: 'json' }] } };
const updateNoPhotos = node({ type: 'n8n-nodes-base.nocoDb', version: 4, config: { name: 'Update item fields and kept photos', position: [1568, 160], credentials: { nocoDbApiToken: newCredential('NocoDB Token account') }, parameters: updateFields } });
const updateWithPhotos = node({ type: 'n8n-nodes-base.nocoDb', version: 4, config: { name: 'Update item before photo uploads', position: [1568, -160], credentials: { nocoDbApiToken: newCredential('NocoDB Token account') }, parameters: updateFields } });
const explodeUpload = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Prepare replacement photo uploads', position: [1792, -160], parameters: { mode: 'runOnceForAllItems', jsCode: ${js(explodeUploadJs)} } } });
const normalize = node({ type: 'n8n-nodes-base.editImage', version: 1, config: { name: 'Normalize edited photo', position: [2016, -160], parameters: { operation: 'resize', width: 1280, height: 1280, options: { destinationKey: 'data', fileName: expr('={{ $json.photo_filename.replace(/\\.[^.]+$/, "") + ".jpg" }}'), format: 'jpeg', quality: 78 } } } });
const prepareUpload = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Prepare edited photo upload', position: [2240, -160], parameters: { mode: 'runOnceForAllItems', jsCode: ${js(prepareUploadJs)} } } });
const upload = node({ type: 'n8n-nodes-base.nocoDb', version: 4, config: { name: 'Upload normalized edited photo', position: [2464, -160], credentials: { nocoDbApiToken: newCredential('NocoDB Token account') }, parameters: { resource: 'row', operation: 'upload', ...noco, id: expr('={{ $json.row_id }}'), uploadMode: 'base64', uploadFieldName: uploadField, filename: expr('={{ $json.photo_filename }}'), contentType: expr('={{ $json.photo_mime_type }}'), base64value: expr('={{ $json.photo_base64 }}') } } });
const response = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Build edit response', position: [2688, 0], executeOnce: true, parameters: { mode: 'runOnceForAllItems', jsCode: ${js(responseJs)} } } });
const respond = node({ type: 'n8n-nodes-base.respondToWebhook', version: 1.5, config: { name: 'Respond to edit webhook', position: [2912, 0], parameters: { respondWith: 'json', responseBody: expr('={{ $json }}'), options: {} } } });
const skipModeration = node({ type: 'n8n-nodes-base.code', version: 2, config: { name: 'Skip moderation for unchanged content', position: [672, 480], parameters: { mode: 'runOnceForAllItems', jsCode: ${js(skipModerationJs)} } } });
const dispatch = node({ type: 'n8n-nodes-base.github', version: 1.1, config: { name: 'Regenerate static pages', position: [3136, 0], credentials: { githubApi: newCredential('GitHub account') }, parameters: { resource: 'workflow', operation: 'dispatch', owner: { __rl: true, mode: 'list', value: 'aldeapucela', cachedResultName: 'aldeapucela' }, repository: { __rl: true, mode: 'list', value: 'segundavida', cachedResultName: 'segundavida' }, workflowId: { __rl: true, mode: 'list', value: '336174137', cachedResultName: 'Generate SegundaVida static item pages' }, ref: { __rl: true, mode: 'list', value: 'main', cachedResultName: 'main' } } } });

export default workflow('sv-edit-item', 'Editar publicación · Segunda Vida')
  .add(webhook).to(validate).to(whoami).to(auth).to(search).to(verify)
  .to(verificationPassed.onTrue(hasPhotos.onTrue(explodeModeration.to(photoChain.to(evaluate))).onFalse(hasEditedText.onTrue(textChain.to(evaluate)).onFalse(skipModeration.to(approved)))).onFalse(respond))
  .add(evaluate).to(approved.onTrue(hasUploads.onTrue(updateWithPhotos.to(explodeUpload.to(normalize.to(prepareUpload.to(upload.to(response)))))).onFalse(updateNoPhotos.to(response))).onFalse(respond))
  .add(response).to(respond).to(dispatch);`;

process.stdout.write(code.replaceAll('__DOLLAR__', '$'));
