import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Magewind implements IAbility {
  private static instance: Magewind;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Magewind";
    this.helpFile = `
help magewind
MAGEWIND

Syntax: cast 'magewind'
It is rumored that there is a sentient wind which lives above the ocean. 
It has also been said that those who are magically inclined can summon this
wind, to aid their ship.
        `;
    this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
    this.abilityUsage = AbilityUsage.Active;

    if (Magewind.instance === undefined) {
      Magewind.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Magewind {
    if (!Magewind.instance) {
      Magewind.instance = new Magewind();
    }
    return Magewind.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Magewind.GetInstance() as T;
  }
}

export default Magewind;
