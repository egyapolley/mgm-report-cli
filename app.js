
const sequelize = require("./sql_database");
const Referral = require("./models/sql_models").Referral;
const Voucher_Code = require("./models/sql_models").Voucher_Code;
const Referred = require("./models/sql_models").Referred;
const moment = require("moment");
const path = require("path");
const fs =require("fs");

const ftpClient = require('ftp');
const { parse } = require('json2csv');

const outputFile = path.join(__dirname, "files_dir",`mgm-report-${moment().format("DD-MM-YYYY")}.txt`);
const remoteFile = `/BIapp/source/IN_FILES/IN_MSISDN_STATE/DOWNLOADED/mgm-report-${moment().format("DD-MM-YYYY")}.txt`
sequelize.sync({logging:false})
    .then(async () =>{

        Voucher_Code.belongsTo(Referral, {constraints: true, onDelete: "CASCADE"});
        Referral.hasMany(Voucher_Code);

        Referred.belongsTo(Voucher_Code, {constraints: true, onDelete: "CASCADE"});
        Voucher_Code.hasMany(Referred);


        console.log("Sequelize connected");
        try {
            const result = await Voucher_Code.findAll({include: [Referral, Referred]});

            let finalResult =[]
            result.forEach(el => {
                let obj ={}
                obj.code =el.code;
                obj.status=getStatus(el.status, el.date_expiry);
                obj.channel =el.channel;
                obj.NumbOfActivatedRefs=el.NumbOfActivatedRefs;
                obj.dateOfExpiry = moment(el.date_expiry).format("DD-MM-YYYY HH:mm:ss")
                obj.ReferralMsisdn = el.referral.msisdn;
                switch (el.status){
                    case "INACTIVE":
                        obj.referred="";
                        obj.dateOfActivation=""
                        finalResult.push(obj);
                        break
                    case "ACTIVE":
                        obj.referred = el.referreds[0].msisdn;
                        obj.dateOfActivation=moment(el.referreds[0].createdAt).format("DD-MM-YYYY HH:mm:ss")
                        finalResult.push(obj);
                        break
                    case "REDEEMED":
                        finalResult.push(
                            {...obj,referred:el.referreds[0].msisdn,dateOfActivation:moment(el.referreds[0].createdAt).format("DD-MM-YYYY HH:mm:ss")},
                            {...obj,referred:el.referreds[1].msisdn,dateOfActivation:moment(el.referreds[1].createdAt).format("DD-MM-YYYY HH:mm:ss")}
                            );
                        break
                }


            })

            const fields = ['ReferralMsisdn', 'code', 'status','channel','dateOfExpiry','NumbOfActivatedRefs','referred','dateOfActivation'];
            const opts = { fields,quote:'' };
            const data = parse(finalResult, opts);

            fs.writeFile(outputFile, data, err => {
                if (err) throw err;
                const client = new ftpClient();
                client.on('ready', function() {
                    client.put(outputFile,remoteFile, function(err) {
                        if (err) throw err;
                        console.log("file upload to BI success")
                        client.end();
                    });
                });
                client.connect({
                    host:"172.25.33.69",
                    user:"obia11g",
                    password:"password"
                })

            })






        } catch (ex) {
            console.log(ex)
        }

    })

function getStatus(status, dateOfExpiry) {
    const now = moment();
    const expiryDate = moment(dateOfExpiry);
    return status !=='REDEEMED' && now.isAfter(expiryDate)?"EXPIRED":status;
}
