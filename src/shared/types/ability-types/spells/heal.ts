import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Heal implements IAbility {
  private static instance: Heal;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = "Heal";
    this.helpFile = `
heal            the most powerful healing spell
`;
    this.manualDescription = `
When used on a player, this will also show the player's current condition after the heal.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Heal.instance === undefined) {
      Heal.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Heal {
    if (!Heal.instance) {
      Heal.instance = new Heal();
    }
    return Heal.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Heal.GetInstance() as T;
  }
}

export default Heal;
