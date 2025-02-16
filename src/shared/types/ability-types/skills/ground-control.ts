import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class GroundControl implements IAbility {
  private static instance: GroundControl;

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
    this.name = "Ground Control";
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `'GROUND CONTROL'
Syntax: gcon <target>
Ground control is the act of throwing your opponent to the ground,
temporarily stunning them. Beware, it is possible to have your throw used
against you.`;

    if (GroundControl.instance === undefined) {
      GroundControl.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): GroundControl {
    if (!GroundControl.instance) {
      GroundControl.instance = new GroundControl();
    }
    return GroundControl.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GroundControl.GetInstance() as T;
  }
}

export default GroundControl;
