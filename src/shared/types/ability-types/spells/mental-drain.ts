import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class MentalDrain implements IAbility {
  private static instance: MentalDrain;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Mental Drain";
    this.helpFile = `
mental drain
Syntax: cast 'mental drain' <target>

When a victim is inflicted with a priest's mental drain, all spells they
attempt to cast will cause strain on their magical ability, increasing the
mana cost.
        `;
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (MentalDrain.instance === undefined) {
      MentalDrain.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): MentalDrain {
    if (!MentalDrain.instance) {
      MentalDrain.instance = new MentalDrain();
    }
    return MentalDrain.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return MentalDrain.GetInstance() as T;
  }
}

export default MentalDrain;
