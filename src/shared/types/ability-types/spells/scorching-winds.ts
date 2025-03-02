import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ScorchingWinds implements IAbility {
  private static instance: ScorchingWinds;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help wujen
Searing Winds - Much like the chaotic and wild chain lightning spell,
searing winds is a multi-target spell that bounces between targets, dealing
fire damage to each.  If there are not enough targets for its use, however,
the winds will rebound upon the caster and hurt them as well.
`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ScorchingWinds.instance === undefined) {
      ScorchingWinds.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ScorchingWinds {
    if (!ScorchingWinds.instance) {
      ScorchingWinds.instance = new ScorchingWinds();
    }
    return ScorchingWinds.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ScorchingWinds.GetInstance() as T;
  }
}

export default ScorchingWinds;
