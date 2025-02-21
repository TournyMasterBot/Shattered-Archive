import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import AngelBasics from "./angel-basics";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Curative from "@shared/types/ability-types/groups-spells/curative";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import HandToHand from "@shared/types/ability-types/skills/hand-to-hand";

export class AngelDefault implements IAbilityGroup {
  static instance: AngelDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.AngelDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...AngelBasics.GetInstance().Get<AngelBasics>().abilities,
      ...Benedictions.GetInstance().Get<Benedictions>().abilities,
      ...Curative.GetInstance().Get<Curative>().abilities,
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      HandToHand.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): AngelDefault {
    if (!AngelDefault.instance) {
      AngelDefault.instance = new AngelDefault();
    }
    return AngelDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return AngelDefault.GetInstance() as T;
  }
}

export default AngelDefault;
