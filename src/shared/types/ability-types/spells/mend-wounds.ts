import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class MendWounds implements IAbility {
  private static instance: MendWounds;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Mend Wounds";
    this.helpFile = `
mend wounds
Syntax: cast 'mend wounds' <target>

Mend wounds is a very powerful heal spell handed down by the gods to a
priest. This healing spell not only heals health, but also one's ability to
move about.
        `;
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (MendWounds.instance === undefined) {
      MendWounds.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): MendWounds {
    if (!MendWounds.instance) {
      MendWounds.instance = new MendWounds();
    }
    return MendWounds.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MendWounds.GetInstance() as T;
  }
}

export default MendWounds;
