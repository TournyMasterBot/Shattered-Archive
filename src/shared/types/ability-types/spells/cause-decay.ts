import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class CauseDecay implements IAbility {
  private static instance: CauseDecay;

  name: string;
  manualDescription?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.manualDescription = `
A spell that causes moderate damage and has a chance to apply debilitating maledictions to the target.
`;
    this.alternateKeyword = "harmful";
    this.recommendedHelpFileChanges =
      "add 'cause decay' to 'help cause' for improved discoverability. I believe* this should auto wire up into 'help harm' as well";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (CauseDecay.instance === undefined) {
      CauseDecay.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): CauseDecay {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return CauseDecay.GetInstance() as T;
  }
}

export default CauseDecay;
