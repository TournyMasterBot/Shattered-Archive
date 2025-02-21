import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import ContinualLight from "@shared/types/ability-types/spells/continual-light";
import CreateWater from "@shared/types/ability-types/spells/create-water";
import CreateHolySymbol from "@shared/types/ability-types/spells/create-holy-symbol";
import CreateFood from "@shared/types/ability-types/spells/create-food";
import CreateRose from "@shared/types/ability-types/spells/create-rose";
import CreateTree from "@shared/types/ability-types/spells/create-tree";
import CreateSpring from "@shared/types/ability-types/spells/create-spring";
import FloatingDisc from "@shared/types/ability-types/spells/floating-disc";
import Illumination from "@shared/types/ability-types/spells/illumination";

export class Creation implements IAbilityGroup {
  static instance: Creation;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.Creation;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      ContinualLight.GetInstance().Get(),
      CreateWater.GetInstance().Get(),
      CreateHolySymbol.GetInstance().Get(),
      CreateFood.GetInstance().Get(),
      CreateRose.GetInstance().Get(),
      CreateTree.GetInstance().Get(),
      CreateSpring.GetInstance().Get(),
      FloatingDisc.GetInstance().Get(),
      Illumination.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Creation {
    if (!Creation.instance) {
      Creation.instance = new Creation();
    }
    return Creation.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Creation.GetInstance() as T;
  }
}

export default Creation;
