import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Peek implements IAbility {
  private static instance: Peek;

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
    this.abilityUsage = AbilityUsage.Passive;
    this.helpFile = `help Peek
PEEK
Syntax: peek <mob/player>
The peek skill is useful for seeing what a player or monster is carrying,
the better to use the steal command with.  More intelligent characters are
harder to peek at.  All characters may learn peek, but thieves are the most
common practitioners.`;

    if (Peek.instance === undefined) {
      Peek.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Peek {
    if (!Peek.instance) {
      Peek.instance = new Peek();
    }
    return Peek.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Peek.GetInstance() as T;
  }
}

export default Peek;
