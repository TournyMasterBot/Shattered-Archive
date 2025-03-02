import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class FlashBomb implements IAbility {
  private static instance: FlashBomb;

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
    this.helpFile = `
'FLASH BOMB'
Syntax:  flash bomb <target>
This is the knowledge of making and using bombs. The bombs are thrown at
the feet of your opponent, enraging them and doing a little damage. There
is a chance that the bomb will not go off.
`;

    if (FlashBomb.instance === undefined) {
      FlashBomb.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): FlashBomb {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return FlashBomb.GetInstance() as T;
  }
}

export default FlashBomb;
