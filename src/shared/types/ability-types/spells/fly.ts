import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Fly implements IAbility {
  private static instance: Fly;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help fly
FLY
FLY
Syntax: cast 'fly' <character>
This spell enables the target character to fly.  There are some areas where
passage may not be enabled simply by flying, for example - an underwater
cave might require the use of swimming to get through.  You cannot rest
sleep or ride a mount while flying.  

See also 'LAND'
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Fly.instance === undefined) {
      Fly.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Fly {
    if (!Fly.instance) {
      Fly.instance = new Fly();
    }
    return Fly.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Fly.GetInstance() as T;
  }
}

export default Fly;
