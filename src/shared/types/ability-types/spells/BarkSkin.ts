import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class BarkSkin implements IAbility {
  private static instance: BarkSkin;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  abilityBuffCommand?: string | undefined;
  abilityBuffVariable?: string | undefined;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.abilityBuffCommand = "c 'bark skin'";
    this.helpFile = `
help 'Bark Skin'
'BARK SKIN'
BARK SKIN

Syntax: cast 'bark skin'

This spell is used by rangers to thicken their skin, offering protection
much like the bark of a tree. This has the effect of improving the ranger's
armor class a bit more than the armor spell.

As tree bark is not as effective for armor as stone is, the spell is not
quite as effective as the stone skin spell.

See also - NATURE RANGER ARMOR STONE SKIN
`;

    if (BarkSkin.instance === undefined) {
      BarkSkin.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): BarkSkin {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BarkSkin.GetInstance() as T;
  }
}

export default BarkSkin;
