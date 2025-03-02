import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Betray implements IAbility {
  private static instance: Betray;

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
help betray
betray
Syntax: cast 'betray' victim

The betray spell steals the charmed mob from another owner. This spell must
be cast while in combat.
`;

    if (Betray.instance === undefined) {
      Betray.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Betray {
    if (!Betray.instance) {
      Betray.instance = new Betray();
    }
    return Betray.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Betray.GetInstance() as T;
  }
}

export default Betray;
