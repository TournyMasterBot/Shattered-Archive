import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Beastform implements IAbility {
  private static instance: Beastform;

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
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
help beastform
beastform
Syntax: cast beastform <bear, moose, coyote>
Syntax: revert
By ingesting large quantities of the sacred mushroom and donning
the hide of a beast, the shaman may commune with the animal spirits.
With the proper chants, the spirit of a wild animal may infuse the
shaman and allow him to change his form into that of the beast.
Revert returns the shaman to his/her normal form.
`;

    if (Beastform.instance === undefined) {
      Beastform.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Beastform {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Beastform.GetInstance() as T;
  }
}

export default Beastform;
