import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class MakeJewelry implements IAbility {
  private static instance: MakeJewelry;

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

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `makejewelry
Syntax: makejewelry ear (or scalp, eyeball, nose or hand)

Makejewelry is known only to those of the barbarian guild.

The barbarian takes a recently butchered body part and makes a special
ornament blessed by their gods to impart favors on to them. The
barbarian's faith in their work creates items with various properties,
experiment with eyeballs, hands, scalps, noses and ears to see what you can
do!

In order for a barbarian to create such macabre pieces of wearable art, the
barbarian must first properly butcher a corpse and take the necessary item
from it.

Syntax: butcher corpse ear (or scalp, eyeball, nose or hand), only a
barbarian can prepare such items and wear bits of their recently slain
enemies as a trophy of their conquest.

See also: "BARBARIAN" and "BUTCHER"`;

    if (MakeJewelry.instance === undefined) {
      MakeJewelry.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): MakeJewelry {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MakeJewelry.GetInstance() as T;
  }
}

export default MakeJewelry;
