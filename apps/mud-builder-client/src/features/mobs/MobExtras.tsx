import { SPEC_FUNS, isKnownSpecFun, type AreaFile, type Shop } from '@shatteredarchive/merc-area';

import { ITEM_TYPES } from '../../data/flags.js';
import {
  getShop,
  getSpecial,
  newShopTemplate,
  removeShop,
  removeSpecial,
  setSpecial,
  upsertShop,
} from '../areas/model-ops.js';
import { NumField } from '../areas/workbench.js';

/**
 * Shop + spec_fun attachments for one mob. These live in the area's #SHOPS and
 * #SPECIALS sections (keyed by the mob's vnum), not on the mob record, so this
 * editor takes and returns the whole area model. Unlisted buy-type numbers and
 * unknown spec_fun words are preserved verbatim (validation, not coercion,
 * decides what blocks a save).
 */
export default function MobExtrasEditor({
  area,
  mobVnum,
  onChange,
}: {
  area: AreaFile;
  mobVnum: number;
  onChange: (a: AreaFile) => void;
}) {
  const shop = getShop(area, mobVnum);
  const specFun = getSpecial(area, mobVnum);

  const patchShop = (patch: Partial<Shop>) => {
    if (shop) onChange(upsertShop(area, { ...shop, ...patch }));
  };

  const knownType = (n: number) => n === 0 || ITEM_TYPES.some((t) => t.value === n);

  return (
    <div className="mb-form mb-mob-extras">
      <fieldset className="mb-fieldset">
        <legend>Shopkeeper</legend>
        {!shop ? (
          <button type="button" onClick={() => onChange(upsertShop(area, newShopTemplate(mobVnum)))}>
            + Make shopkeeper
          </button>
        ) : (
          <>
            <div className="mb-form-grid">
              <NumField label="Profit buy %" value={shop.profitBuy} onChange={(v) => patchShop({ profitBuy: v })} />
              <NumField label="Profit sell %" value={shop.profitSell} onChange={(v) => patchShop({ profitSell: v })} />
              <NumField label="Open hour" value={shop.openHour} onChange={(v) => patchShop({ openHour: v })} />
              <NumField label="Close hour" value={shop.closeHour} onChange={(v) => patchShop({ closeHour: v })} />
            </div>
            <div className="mb-row">
              {shop.buyTypes.map((t, i) => (
                <label className="mb-field" key={i}>
                  <span>Buys #{i + 1}</span>
                  <select
                    aria-label={`Buy type ${i + 1}`}
                    value={t}
                    onChange={(e) => {
                      const buyTypes = [...shop.buyTypes] as Shop['buyTypes'];
                      buyTypes[i] = Number(e.target.value) || 0;
                      patchShop({ buyTypes });
                    }}
                  >
                    <option value={0}>(unused)</option>
                    {!knownType(t) && <option value={t}>{t} (as written)</option>}
                    {ITEM_TYPES.map((it) => (
                      <option key={it.value} value={it.value}>
                        {it.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="mb-entity-actions">
              <button type="button" className="mb-danger" onClick={() => onChange(removeShop(area, mobVnum))}>
                Remove shop
              </button>
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="mb-fieldset">
        <legend>Special function</legend>
        <div className="mb-row">
          <label className="mb-field mb-field--grow">
            <span>spec_fun (C behavior attached to this mob)</span>
            <select
              aria-label="Special function"
              value={specFun ?? ''}
              onChange={(e) =>
                e.target.value === ''
                  ? onChange(removeSpecial(area, mobVnum))
                  : onChange(setSpecial(area, mobVnum, e.target.value))
              }
            >
              <option value="">(none)</option>
              {specFun !== undefined && !SPEC_FUNS.includes(specFun as (typeof SPEC_FUNS)[number]) && (
                <option value={specFun}>{specFun} (as written)</option>
              )}
              {SPEC_FUNS.map((sf) => (
                <option key={sf} value={sf}>
                  {sf}
                </option>
              ))}
            </select>
          </label>
        </div>
        {specFun !== undefined && !isKnownSpecFun(specFun) && (
          <p className="mb-muted">
            '{specFun}' is not in the game's spec_table — the save will be blocked (an unknown spec_fun is fatal at
            boot).
          </p>
        )}
      </fieldset>
    </div>
  );
}
