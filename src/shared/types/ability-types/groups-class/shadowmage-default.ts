import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Detection from "../groups-spells/detection";
import Illusion from "../groups-spells/illusion";
import Maladictions from "../groups-spells/maladictions";
import Protective from "../groups-spells/protective";
import Shadowmagic from "../groups-spells/shadowmagic";
import Transportation from "../groups-spells/transportation";
import Weather from "../groups-spells/weather";

export class ShadowmageDefault implements IAbilityGroup {
  static instance: ShadowmageDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.ShadowmageDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Shadowmagic.GetInstance().Get<Shadowmagic>().abilities,
      ...Weather.GetInstance().Get<Weather>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Illusion.GetInstance().Get<Illusion>().abilities,
      ...Maladictions.GetInstance().Get<Maladictions>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShadowmageDefault {
    if (!ShadowmageDefault.instance) {
      ShadowmageDefault.instance = new ShadowmageDefault();
    }
    return ShadowmageDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShadowmageDefault.GetInstance() as T;
  }
}

export default ShadowmageDefault;
