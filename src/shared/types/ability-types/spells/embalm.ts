import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Embalm implements IAbility {
  private static instance: Embalm;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help embalm
EMBALM
EMBALM

Syntax: cast embalm <object>

Embalm is a low level spell, used to preserve pieces of flesh and organs
that are harvested off of corpses for later use by necromancers.  

The embalm spell halts rot and decay on the item, ensuring that it will
remain freshly harvested when the Necromancer is ready to put it to use.  

See also - NECROMANCY NECROMANCER 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Embalm.instance === undefined) {
      Embalm.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Embalm {
    if (!Embalm.instance) {
      Embalm.instance = new Embalm();
    }
    return Embalm.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Embalm.GetInstance() as T;
  }
}

export default Embalm;
