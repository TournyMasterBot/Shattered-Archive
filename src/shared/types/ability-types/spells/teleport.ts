import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Teleport implements IAbility {
  private static instance: Teleport;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help teleport
TELEPORT
TELEPORT
Syntax: cast <teleport>
This spell takes you from your current location to a random location somewhere
in the world.
`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Teleport.instance === undefined) {
      Teleport.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Teleport {
    if (!Teleport.instance) {
      Teleport.instance = new Teleport();
    }
    return Teleport.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Teleport.GetInstance() as T;
  }
}

export default Teleport;
