import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Spook implements IAbility {
  private static instance: Spook;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;
  manualDescription: string;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help spook
spook
syntax: cast 'spook' <target>
The spook spell sends visions of an opponent's worst nightmares into their
head. The visions are so real looking that many people will flee in
terror. Some races, however, are amused at such sights.`;
    this.manualDescription = "";
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Spook.instance === undefined) {
      Spook.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Spook {
    if (!Spook.instance) {
      Spook.instance = new Spook();
    }
    return Spook.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Spook.GetInstance() as T;
  }
}

export default Spook;
