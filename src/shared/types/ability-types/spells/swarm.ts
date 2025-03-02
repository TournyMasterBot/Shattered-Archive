import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Swarm implements IAbility {
  private static instance: Swarm;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help swarm
SWARM
SWARM

This spell allows a druid to summon forth a large group of biting insects
which gnaw through all armor and attack all who oppose the caster.  The
insects continue to follow the inflicted opponents for a couple of rounds
before dissipating.  

See also - NATURE 
`;
    this.manualDescription = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Swarm.instance === undefined) {
      Swarm.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Swarm {
    if (!Swarm.instance) {
      Swarm.instance = new Swarm();
    }
    return Swarm.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Swarm.GetInstance() as T;
  }
}

export default Swarm;
